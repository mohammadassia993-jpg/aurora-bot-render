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

function getTypes(name) {
  if (name == "Depositor") {
    return {
      Deposit: [
        { name: "sender", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "destinationAddress", type: "address" },
        { name: "deadline", type: "uint256" },
      ],
    };
  } else {
    return {
      Withdraw: [
        { name: "sender", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
  }
}

function getValue(name, sender, amount, destinationAddress, deadline) {
  if (name == "Depositor") {
    return {
      sender,
      amount,
      destinationAddress,
      deadline,
    };
  } else {
    return {
      sender,
      amount,
      deadline,
    };
  }
}

async function getAmlSignature({
  name,
  amlSigner,
  sender,
  amount,
  deadline,
  destinationAddress,
  verifyingContract,
}) {
  // Define the EIP-712 Domain
  const domain = {
    name,
    version: "1",
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract,
  };

  // Define the Types (matches your Solidity struct exactly)
  const types = getTypes(name);

  // Define the Values
  const value = getValue(name, sender, amount, destinationAddress, deadline);

  // Sign using signTypedData
  const signature = await amlSigner.signTypedData(domain, types, value);

  return signature;
}

module.exports = { buildPermit, getAmlSigner, getAmlSignature };
