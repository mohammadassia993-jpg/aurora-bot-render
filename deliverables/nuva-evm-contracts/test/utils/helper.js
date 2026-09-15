const { ethers } = require("hardhat");

async function buildPermit({
  token,
  owner,
  spender,
  value,
  deadline,
  version,
}) {
  const name = await token.name();
  const nonce = await token.nonces(owner.address);
  const chainId = (await owner.provider.getNetwork()).chainId;

  const domain = {
    name,
    version,
    chainId,
    verifyingContract: token.target,
  };

  // Define the Types (matches your Solidity struct exactly)
  types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  // Define the Values
  value = {
    owner: owner.address,
    spender,
    value,
    nonce,
    deadline,
  };

  // Sign using signTypedData
  const signature = await owner.signTypedData(domain, types, value);
  const { r, s, v } = ethers.Signature.from(signature);

  return { v, r, s };
}

module.exports = { buildPermit };
