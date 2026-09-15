const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("CrossChainManagerDeployment", (m) => {
  // Define Parameters (This replaces process.env)
  const paymentToken = m.getParameter("paymentToken");
  const amlSigner = m.getParameter("amlSigner");
  const crossChainVaultAddr = m.getParameter("crossChainVault");
  const crossChainVault = m.contractAt("CrossChainVault", crossChainVaultAddr);
  const name = m.getParameter("name");
  const symbol = m.getParameter("symbol");
  const admin = m.getAccount(0);
  const nttRelayer = m.getParameter("nttRelayer");
  const decimals = m.getParameter("decimals");
  const destinationAddress = m.getParameter("destinationAddress");
  const targetChain = m.getParameter("targetChain");
  const targetDomain = m.getParameter("targetDomain");

  // Deploy the Token directly as a contract.
  // This creates a valid ContractFuture that returns an address.
  const shareTokenImpl = m.contract("CustomToken", [], {
    id: "CustomTokenImplementation",
  });

  // Encode the initializer function call
  const shareTokenInitData = m.encodeFunctionCall(
    shareTokenImpl,
    "initialize",
    [name, symbol, admin, decimals],
  );

  // Deploy the actual Proxy, pointing it at the implementation and passing the init data
  const shareTokenProxy = m.contract(
    "ERC1967Proxy",
    [shareTokenImpl, shareTokenInitData],
    {
      id: "ShareTokenProxy", // IDs are required when deploying multiple contracts of the same name
    },
  );

  // Tell Ignition to interact with the Proxy using the CustomToken ABI
  const shareToken = m.contractAt("CustomToken", shareTokenProxy, {
    id: "ShareTokenInstance",
  });

  // Deploy CrossChainManager UUPS Proxy
  const crossChainManagerImpl = m.contract("CrossChainManager", [], {
    id: "CrossChainManagerImplementation",
  });

  // Encode the initializer function call
  const crossChainManagerInitData = m.encodeFunctionCall(
    crossChainManagerImpl,
    "initialize",
    [paymentToken, shareToken, amlSigner, crossChainVaultAddr],
  );

  // Deploy the actual Proxy, pointing it at the implementation and passing the init data
  const crossChainManagerProxy = m.contract(
    "ERC1967Proxy",
    [crossChainManagerImpl, crossChainManagerInitData],
    {
      id: "CrossChainManagerProxy", // IDs are required when deploying multiple contracts of the same name
    },
  );

  const crossChainManager = m.contractAt(
    "CrossChainManager",
    crossChainManagerProxy,
  );

  // Grant BURN_ROLE to NTT Relayer Address in Cross Chain Manager contract
  const burnRole = ethers.id("BURN_ROLE");
  m.call(crossChainManager, "grantRole", [burnRole, nttRelayer]);

  m.call(shareToken, "addMinter", [nttRelayer]);

  const whitelistedRole = ethers.id("WHITELISTED_ROLE");
  m.call(crossChainVault, "grantRole", [
    whitelistedRole,
    crossChainManager.address,
  ]);

  m.call(crossChainManager, "addDestinationAddress", [
    destinationAddress,
    targetChain,
    targetDomain,
  ]);

  // Return the interactable contracts for use in future modules or tests
  return {
    crossChainManager,
    shareToken,
  };
});
