const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CustomToken", function () {
  async function deployFixture() {
    const [deployer, user] = await ethers.getSigners();

    const name = "MyToken";
    const symbol = "MTK";
    const initialSupply = 1_000_000n; // human units
    const decimals = 6;

    const CustomToken = await ethers.getContractFactory("CustomToken");

    // Deploy proxy and initialize
    const proxy = await upgrades.deployProxy(
      CustomToken,
      [name, symbol, deployer.address, decimals],
      {
        initializer: "initialize",
        kind: "uups",
      },
    );
    await proxy.waitForDeployment();

    const proxyAddress = await proxy.getAddress();
    const customToken = await ethers.getContractAt("CustomToken", proxyAddress);

    const scale = BigInt(10 ** decimals);
    // Deployer needs to be granted MINTER_ROLE before minting
    await customToken.connect(deployer).addMinter(await deployer.getAddress());
    await customToken
      .connect(deployer)
      .mint(await deployer.getAddress(), initialSupply * scale);

    return {
      deployer,
      user,
      token: customToken,
      name,
      symbol,
      initialSupply: BigInt(initialSupply),
      decimals,
    };
  }

  it("sets custom decimals and mints initial supply scaled", async function () {
    const { deployer, token, initialSupply, decimals } = await deployFixture();
    expect(await token.decimals()).to.equal(decimals);

    const expected = initialSupply * BigInt(10 ** decimals);
    const bal = await token.balanceOf(await deployer.getAddress());
    expect(bal).to.equal(expected);
  });

  it("owner-only mint works", async function () {
    const { deployer, user, token, decimals } = await deployFixture();
    const ownerAddr = await deployer.getAddress();

    const amount = 1_000n * BigInt(10 ** decimals);

    await expect(
      token.connect(user).mint(ownerAddr, amount),
    ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");

    const prev = await token.balanceOf(ownerAddr);
    await expect(token.connect(deployer).mint(ownerAddr, amount))
      .to.emit(token, "Transfer")
      .withArgs(ethers.ZeroAddress, ownerAddr, amount);
    const after = await token.balanceOf(ownerAddr);
    expect(after).to.equal(prev + amount);
  });

  describe("Burn Functionality", function () {
    it("should allow token holder to burn their own tokens", async function () {
      const { deployer, token, decimals } = await deployFixture();
      const burnAmount = 100n * BigInt(10 ** decimals);
      const initialBalance = await token.balanceOf(await deployer.getAddress());
      const initialSupply = await token.totalSupply();

      await expect(token.connect(deployer).burn(burnAmount))
        .to.emit(token, "TokensBurned")
        .withArgs(await deployer.getAddress(), burnAmount);

      const finalBalance = await token.balanceOf(await deployer.getAddress());
      const finalSupply = await token.totalSupply();

      expect(finalBalance).to.equal(initialBalance - burnAmount);
      expect(finalSupply).to.equal(initialSupply - burnAmount);
    });

    it("should revert when burning more tokens than balance", async function () {
      const { deployer, token, decimals } = await deployFixture();
      const balance = await token.balanceOf(await deployer.getAddress());
      const burnAmount = balance + 1n;

      await expect(token.connect(deployer).burn(burnAmount))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")
        .withArgs(await deployer.getAddress(), balance, burnAmount);
    });

    it("should allow approved spender to burn tokens using burnFrom", async function () {
      const { deployer, user, token, decimals } = await deployFixture();
      const userAddr = await user.getAddress();
      const burnAmount = 50n * BigInt(10 ** decimals);

      // Transfer tokens to user
      await token.connect(deployer).transfer(userAddr, burnAmount);

      // Approve deployer to spend user's tokens
      await token
        .connect(user)
        .approve(await deployer.getAddress(), burnAmount);

      const initialBalance = await token.balanceOf(userAddr);
      const initialSupply = await token.totalSupply();

      await expect(token.connect(deployer).burnFrom(userAddr, burnAmount))
        .to.emit(token, "TokensBurned")
        .withArgs(userAddr, burnAmount);

      const finalBalance = await token.balanceOf(userAddr);
      const finalSupply = await token.totalSupply();

      expect(finalBalance).to.equal(initialBalance - burnAmount);
      expect(finalSupply).to.equal(initialSupply - burnAmount);
    });

    it("should revert when burning more than allowance with burnFrom", async function () {
      const { deployer, user, token, decimals } = await deployFixture();
      const userAddr = await user.getAddress();
      const transferAmount = 100n * BigInt(10 ** decimals);
      const burnAmount = 150n * BigInt(10 ** decimals);

      await token.connect(deployer).transfer(userAddr, transferAmount);
      await token
        .connect(user)
        .approve(await deployer.getAddress(), transferAmount);

      await expect(token.connect(deployer).burnFrom(userAddr, burnAmount))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance")
        .withArgs(await deployer.getAddress(), transferAmount, burnAmount);
    });

    it("should emit Transfer event when burning tokens", async function () {
      const { deployer, token, decimals } = await deployFixture();
      const burnAmount = 10n * BigInt(10 ** decimals);
      const deployerAddr = await deployer.getAddress();

      await expect(token.connect(deployer).burn(burnAmount))
        .to.emit(token, "Transfer")
        .withArgs(deployerAddr, ethers.ZeroAddress, burnAmount);
    });
  });

  it("transfer moves balances", async function () {
    const { deployer, user, token, decimals } = await deployFixture();

    const amt = 123n * BigInt(10 ** decimals);
    const userAddr = await user.getAddress();

    await expect(token.connect(deployer).transfer(userAddr, amt)).to.emit(
      token,
      "Transfer",
    );

    await expect(
      token.connect(user).transfer(await deployer.getAddress(), amt),
    ).to.emit(token, "Transfer");
  });

  describe("EIP3009 Functionality", function () {
    // Helper to build the EIP712 domain separator matching the contract
    const buildDomain = async (token, name) => {
      const network = await ethers.provider.getNetwork();
      return {
        name: name,
        version: "1", // OpenZeppelin's ERC20Permit defaults to version "1"
        chainId: network.chainId,
        verifyingContract: await token.getAddress(),
      };
    };

    it("should execute transferWithAuthorization successfully", async function () {
      const { deployer, user, token, name, decimals } = await deployFixture();
      const from = await deployer.getAddress();
      const to = await user.getAddress();
      const value = 500n * BigInt(10 ** decimals);
      const validAfter = 0;
      const validBefore = Math.floor(Date.now() / 1000) + 3600; // valid for 1 hour
      const nonce = ethers.hexlify(ethers.randomBytes(32));

      const domain = await buildDomain(token, name);
      const types = {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      };
      const message = { from, to, value, validAfter, validBefore, nonce };

      // Deployer signs the authorization off-chain
      const signature = await deployer.signTypedData(domain, types, message);
      const sig = ethers.Signature.from(signature);

      const initialFromBal = await token.balanceOf(from);
      const initialToBal = await token.balanceOf(to);

      // User (or any relayer) submits the transaction
      await expect(
        token
          .connect(user)
          .transferWithAuthorization(
            from,
            to,
            value,
            validAfter,
            validBefore,
            nonce,
            sig.v,
            sig.r,
            sig.s,
          ),
      )
        .to.emit(token, "AuthorizationUsed")
        .withArgs(from, nonce)
        .and.to.emit(token, "Transfer")
        .withArgs(from, to, value);

      expect(await token.balanceOf(from)).to.equal(initialFromBal - value);
      expect(await token.balanceOf(to)).to.equal(initialToBal + value);
      expect(await token.authorizationState(from, nonce)).to.be.true;
    });

    it("should execute receiveWithAuthorization when caller is the payee", async function () {
      const { deployer, user, token, name, decimals } = await deployFixture();
      const from = await deployer.getAddress();
      const to = await user.getAddress(); // Payee
      const value = 250n * BigInt(10 ** decimals);
      const validAfter = 0;
      const validBefore = Math.floor(Date.now() / 1000) + 3600;
      const nonce = ethers.hexlify(ethers.randomBytes(32));

      const domain = await buildDomain(token, name);
      const types = {
        ReceiveWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      };
      const message = { from, to, value, validAfter, validBefore, nonce };

      const signature = await deployer.signTypedData(domain, types, message);
      const sig = ethers.Signature.from(signature);

      // Must be submitted by the 'to' address (user)
      await expect(
        token
          .connect(user)
          .receiveWithAuthorization(
            from,
            to,
            value,
            validAfter,
            validBefore,
            nonce,
            sig.v,
            sig.r,
            sig.s,
          ),
      )
        .to.emit(token, "AuthorizationUsed")
        .withArgs(from, nonce);
    });

    it("should revert receiveWithAuthorization if caller is not the payee", async function () {
      const { deployer, user, token, name, decimals } = await deployFixture();
      const from = await deployer.getAddress();
      const to = await user.getAddress();
      const value = 250n * BigInt(10 ** decimals);
      const validAfter = 0;
      const validBefore = Math.floor(Date.now() / 1000) + 3600;
      const nonce = ethers.hexlify(ethers.randomBytes(32));

      const domain = await buildDomain(token, name);
      const types = {
        ReceiveWithAuthorization: [
          // Uses RECEIVE_WITH_AUTHORIZATION_TYPEHASH [cite: 35]
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      };
      const message = { from, to, value, validAfter, validBefore, nonce };

      const signature = await deployer.signTypedData(domain, types, message);
      const sig = ethers.Signature.from(signature);

      // Deployer tries to submit it instead of the Payee (user)
      await expect(
        token
          .connect(deployer)
          .receiveWithAuthorization(
            from,
            to,
            value,
            validAfter,
            validBefore,
            nonce,
            sig.v,
            sig.r,
            sig.s,
          ),
      ).to.be.revertedWith("EIP3009: caller must be the payee"); // Expected revert [cite: 51]
    });

    it("should cancel an authorization successfully", async function () {
      const { deployer, user, token, name } = await deployFixture();
      const authorizer = await deployer.getAddress();
      const nonce = ethers.hexlify(ethers.randomBytes(32));

      const domain = await buildDomain(token, name);
      const types = {
        CancelAuthorization: [
          // Uses CANCEL_AUTHORIZATION_TYPEHASH [cite: 36]
          { name: "authorizer", type: "address" },
          { name: "nonce", type: "bytes32" },
        ],
      };
      const message = { authorizer, nonce };

      const signature = await deployer.signTypedData(domain, types, message);
      const sig = ethers.Signature.from(signature);

      // Anyone can submit the cancellation as long as the signature is valid
      await expect(
        token
          .connect(user)
          .cancelAuthorization(authorizer, nonce, sig.v, sig.r, sig.s),
      )
        .to.emit(token, "AuthorizationCanceled")
        .withArgs(authorizer, nonce); // Event emitted upon success [cite: 38]

      expect(await token.authorizationState(authorizer, nonce)).to.be.true; // State updated [cite: 42, 59]
    });

    it("should revert if the authorization is expired", async function () {
      const { deployer, user, token, name, decimals } = await deployFixture();
      const from = await deployer.getAddress();
      const to = await user.getAddress();
      const value = 100n * BigInt(10 ** decimals);
      const validAfter = 0;

      // Set validBefore to the past
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const validBefore = blockBefore.timestamp - 100;

      const nonce = ethers.hexlify(ethers.randomBytes(32));

      const domain = await buildDomain(token, name);
      const types = {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      };
      const message = { from, to, value, validAfter, validBefore, nonce };

      const signature = await deployer.signTypedData(domain, types, message);
      const sig = ethers.Signature.from(signature);

      await expect(
        token
          .connect(user)
          .transferWithAuthorization(
            from,
            to,
            value,
            validAfter,
            validBefore,
            nonce,
            sig.v,
            sig.r,
            sig.s,
          ),
      ).to.be.revertedWith("EIP3009: authorization is expired"); // Expected revert for expired tx [cite: 61]
    });
  });

  describe("Minter Management Functions", function () {
    it("should allow owner to add a new minter", async function () {
      const { deployer, user, token } = await deployFixture();
      const userAddr = await user.getAddress();
      const MINTER_ROLE = await token.MINTER_ROLE();

      // Initially user should not have MINTER_ROLE
      expect(await token.hasRole(MINTER_ROLE, userAddr)).to.be.false;

      // Owner adds user as minter
      await expect(token.connect(deployer).addMinter(userAddr))
        .to.emit(token, "RoleGranted")
        .withArgs(MINTER_ROLE, userAddr, await deployer.getAddress());

      // User should now have MINTER_ROLE
      expect(await token.hasRole(MINTER_ROLE, userAddr)).to.be.true;
    });

    it("should allow owner to remove a minter", async function () {
      const { deployer, user, token } = await deployFixture();
      const userAddr = await user.getAddress();
      const MINTER_ROLE = await token.MINTER_ROLE();

      // First add user as minter
      await token.connect(deployer).addMinter(userAddr);
      expect(await token.hasRole(MINTER_ROLE, userAddr)).to.be.true;

      // Owner removes user as minter
      await expect(token.connect(deployer).removeMinter(userAddr))
        .to.emit(token, "RoleRevoked")
        .withArgs(MINTER_ROLE, userAddr, await deployer.getAddress());

      // User should no longer have MINTER_ROLE
      expect(await token.hasRole(MINTER_ROLE, userAddr)).to.be.false;
    });

    it("should not allow non-owner to add a minter", async function () {
      const { deployer, user, token } = await deployFixture();
      const userAddr = await user.getAddress();

      // User tries to add themselves as minter (should fail)
      await expect(
        token.connect(user).addMinter(userAddr),
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("should not allow non-owner to remove a minter", async function () {
      const { deployer, user, token } = await deployFixture();
      const deployerAddr = await deployer.getAddress();
      const MINTER_ROLE = await token.MINTER_ROLE();

      // User tries to remove deployer as minter (should fail)
      await expect(
        token.connect(user).removeMinter(deployerAddr),
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("should emit RoleGranted event when adding a minter", async function () {
      const { deployer, user, token } = await deployFixture();
      const userAddr = await user.getAddress();
      const deployerAddr = await deployer.getAddress();
      const MINTER_ROLE = await token.MINTER_ROLE();

      // Add user as minter and check for RoleGranted event
      await expect(token.connect(deployer).addMinter(userAddr))
        .to.emit(token, "RoleGranted")
        .withArgs(MINTER_ROLE, userAddr, deployerAddr);
    });

    it("should emit RoleRevoked event when removing a minter", async function () {
      const { deployer, user, token } = await deployFixture();
      const userAddr = await user.getAddress();
      const deployerAddr = await deployer.getAddress();
      const MINTER_ROLE = await token.MINTER_ROLE();

      // First add user as minter
      await token.connect(deployer).addMinter(userAddr);

      // Then remove user as minter and check for RoleRevoked event
      await expect(token.connect(deployer).removeMinter(userAddr))
        .to.emit(token, "RoleRevoked")
        .withArgs(MINTER_ROLE, userAddr, deployerAddr);
    });

    it("should allow newly added minter to mint tokens", async function () {
      const { deployer, user, token, decimals } = await deployFixture();
      const userAddr = await user.getAddress();
      const mintAmount = 1000n * BigInt(10 ** decimals);

      // Add user as minter
      await token.connect(deployer).addMinter(userAddr);

      // User should now be able to mint tokens
      await expect(token.connect(user).mint(userAddr, mintAmount))
        .to.emit(token, "Transfer")
        .withArgs(ethers.ZeroAddress, userAddr, mintAmount);

      expect(await token.balanceOf(userAddr)).to.equal(mintAmount);
    });

    it("should not allow removed minter to mint tokens", async function () {
      const { deployer, user, token, decimals } = await deployFixture();
      const userAddr = await user.getAddress();
      const mintAmount = 1000n * BigInt(10 ** decimals);

      // Add user as minter first
      await token.connect(deployer).addMinter(userAddr);
      expect(await token.hasRole(await token.MINTER_ROLE(), userAddr)).to.be
        .true;

      // Remove user as minter
      await token.connect(deployer).removeMinter(userAddr);
      expect(await token.hasRole(await token.MINTER_ROLE(), userAddr)).to.be
        .false;

      // User should no longer be able to mint tokens
      await expect(
        token.connect(user).mint(userAddr, mintAmount),
      ).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("Role Enumeration Functions", function () {
    it("should verify deployer is the owner", async function () {
      const { deployer, token } = await deployFixture();

      // Verify deployer is the owner
      const owner = await token.owner();
      expect(owner).to.equal(await deployer.getAddress());
    });

    it("should return correct role member count for MINTER_ROLE", async function () {
      const { deployer, token } = await deployFixture();
      const MINTER_ROLE = await token.MINTER_ROLE();

      // Initially deployer has MINTER_ROLE (granted in deployFixture)
      const initialCount = await token.getRoleMemberCount(MINTER_ROLE);
      expect(initialCount).to.equal(1);

      // Verify the member is the deployer
      const member = await token.getRoleMember(MINTER_ROLE, 0);
      expect(member).to.equal(await deployer.getAddress());
    });

    it("should update role member count when granting roles", async function () {
      const { deployer, user, token } = await deployFixture();
      const MINTER_ROLE = await token.MINTER_ROLE();
      const userAddr = await user.getAddress();

      // Initial count
      const initialCount = await token.getRoleMemberCount(MINTER_ROLE);
      expect(initialCount).to.equal(1);

      // Grant role to user
      await token.connect(deployer).addMinter(userAddr);

      // Count should increase
      const finalCount = await token.getRoleMemberCount(MINTER_ROLE);
      expect(finalCount).to.equal(2);

      // Verify both members are accessible
      const member0 = await token.getRoleMember(MINTER_ROLE, 0);
      const member1 = await token.getRoleMember(MINTER_ROLE, 1);
      expect(member0).to.equal(await deployer.getAddress());
      expect(member1).to.equal(userAddr);
    });

    it("should update role member count when revoking roles", async function () {
      const { deployer, user, token } = await deployFixture();
      const MINTER_ROLE = await token.MINTER_ROLE();
      const userAddr = await user.getAddress();

      // Grant role to user first
      await token.connect(deployer).addMinter(userAddr);
      expect(await token.getRoleMemberCount(MINTER_ROLE)).to.equal(2);

      // Revoke role from user
      await token.connect(deployer).removeMinter(userAddr);

      // Count should decrease
      const finalCount = await token.getRoleMemberCount(MINTER_ROLE);
      expect(finalCount).to.equal(1);

      // Verify remaining member
      const member = await token.getRoleMember(MINTER_ROLE, 0);
      expect(member).to.equal(await deployer.getAddress());
    });

    it("should return correct members in order for multiple role members", async function () {
      const { deployer, token } = await deployFixture();
      const [, , user1, user2, user3] = await ethers.getSigners();
      const MINTER_ROLE = await token.MINTER_ROLE();

      // Grant roles to multiple users
      await token.connect(deployer).addMinter(await user1.getAddress());
      await token.connect(deployer).addMinter(await user2.getAddress());
      await token.connect(deployer).addMinter(await user3.getAddress());

      // Check total count
      const count = await token.getRoleMemberCount(MINTER_ROLE);
      expect(count).to.equal(4); // deployer + 3 users

      // Verify all members exist (order may vary based on implementation)
      const members = [];
      for (let i = 0; i < count; i++) {
        members.push(await token.getRoleMember(MINTER_ROLE, i));
      }

      // Check that all expected addresses are in the members list
      const expectedAddresses = [
        await deployer.getAddress(),
        await user1.getAddress(),
        await user2.getAddress(),
        await user3.getAddress(),
      ];

      expectedAddresses.forEach((addr) => {
        expect(members).to.include(addr);
      });
    });

    it("should revert when accessing role member with invalid index", async function () {
      const { deployer, token } = await deployFixture();
      const MINTER_ROLE = await token.MINTER_ROLE();

      // Try to access index that doesn't exist
      await expect(token.getRoleMember(MINTER_ROLE, 1)).to.be.reverted;
    });

    it("should handle role enumeration correctly after revoking and re-granting", async function () {
      const { deployer, user, token } = await deployFixture();
      const MINTER_ROLE = await token.MINTER_ROLE();
      const userAddr = await user.getAddress();

      // Grant role to user
      await token.connect(deployer).addMinter(userAddr);
      expect(await token.getRoleMemberCount(MINTER_ROLE)).to.equal(2);

      // Revoke role from user
      await token.connect(deployer).removeMinter(userAddr);
      expect(await token.getRoleMemberCount(MINTER_ROLE)).to.equal(1);

      // Re-grant role to same user
      await token.connect(deployer).addMinter(userAddr);
      expect(await token.getRoleMemberCount(MINTER_ROLE)).to.equal(2);

      // Verify user is in the role members
      const members = [];
      for (let i = 0; i < 2; i++) {
        members.push(await token.getRoleMember(MINTER_ROLE, i));
      }
      expect(members).to.include(userAddr);
    });
  });

  describe("Mint Role Access Control", function () {
    it("mint roles works", async function () {
      const { deployer, user, token, decimals } = await deployFixture();
      const deployerAddr = await deployer.getAddress();

      const amount = 1_000n * BigInt(10 ** decimals);

      await expect(
        token.connect(user).mint(deployerAddr, amount),
      ).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount",
      );

      const prev = await token.balanceOf(deployerAddr);
      await expect(token.connect(deployer).mint(deployerAddr, amount))
        .to.emit(token, "Transfer")
        .withArgs(ethers.ZeroAddress, deployerAddr, amount);
      const after = await token.balanceOf(deployerAddr);
      expect(after).to.equal(prev + amount);
    });
  });

  describe("Burn Functionality", function () {
    it("burn and burnFrom reduce balances and totalSupply", async function () {
      const { deployer, user, token, decimals } = await deployFixture();
      const deployerAddr = await deployer.getAddress();
      const userAddr = await user.getAddress();

      const burnAmt = 10n * BigInt(10 ** decimals);
      const supplyBefore = await token.totalSupply();
      await token.connect(deployer).burn(burnAmt);
      const supplyAfter = await token.totalSupply();
      expect(supplyAfter).to.equal(supplyBefore - burnAmt);

      // transfer some to user for burnFrom test
      await token.connect(deployer).transfer(userAddr, burnAmt);
      await token.connect(user).approve(deployerAddr, burnAmt);
      await token.connect(deployer).burnFrom(userAddr, burnAmt);

      expect(await token.balanceOf(userAddr)).to.equal(0);
    });
  });
});
