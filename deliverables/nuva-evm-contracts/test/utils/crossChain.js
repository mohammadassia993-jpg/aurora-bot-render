const { ethers } = require("hardhat");
const { buildPermit } = require("./helper");

function getAmlSigner() {
  const amlPrivateKey = process.env.AML_PRIVATE_KEY;
  if (!amlPrivateKey || amlPrivateKey.length !== 66) {
    // 0x + 64 hex chars
    throw new Error(
      "Invalid or missing AML_PRIVATE_KEY in .env file. " +
        "It should be a 66-character hex string (starting with 0x).",
    );
  }
  return new ethers.Wallet(amlPrivateKey, ethers.provider);
}

async function getDepositAmlSignature({
  amlSigner,
  sender,
  amount,
  deadline,
  destinationAddress,
  targetChain,
  targetDomain,
  executorArgs,
  feeArgs,
  verifyingContract,
}) {
  // Define the EIP-712 Domain
  const domain = {
    name: "Depositor",
    version: "1",
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract,
  };

  // Define the Types (matches your Solidity struct exactly)
  const types = {
    Deposit: [
      { name: "sender", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "destinationAddress", type: "address" },
      { name: "deadline", type: "uint256" },
      { name: "targetChain", type: "uint16" },
      { name: "targetDomain", type: "uint32" },
      { name: "executorArgs", type: "ExecutorArgs" },
      { name: "feeArgs", type: "FeeArgs" },
    ],
    // Define the nested ExecutorArgs struct
    ExecutorArgs: [
      { name: "refundAddress", type: "address" },
      { name: "signedQuote", type: "bytes" },
      { name: "instructions", type: "bytes" },
    ],
    // Define the nested FeeArgs struct
    FeeArgs: [
      { name: "transferTokenFee", type: "uint256" },
      { name: "nativeTokenFee", type: "uint256" },
      { name: "payee", type: "address" },
    ],
  };

  // Define the Values
  const value = {
    sender,
    amount,
    destinationAddress,
    deadline,
    targetChain,
    targetDomain,
    executorArgs,
    feeArgs,
  };

  // Sign using signTypedData
  const signature = await amlSigner.signTypedData(domain, types, value);

  return signature;
}

async function getWithdrawAmlSignature({
  amlSigner,
  sender,
  amount,
  deadline,
  verifyingContract,
}) {
  // Define the EIP-712 Domain
  const domain = {
    name: "Withdrawal",
    version: "1",
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract,
  };

  // Define the Types (matches your Solidity struct exactly)
  const types = {
    Withdraw: [
      { name: "sender", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  // Define the Values
  const value = {
    sender,
    amount,
    deadline,
  };

  // Sign using signTypedData
  const signature = await amlSigner.signTypedData(domain, types, value);

  return signature;
}

module.exports = {
  buildPermit,
  getAmlSigner,
  getDepositAmlSignature,
  getWithdrawAmlSignature,
};
