const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

/**
 * Validates an Ethereum address using a regular expression.
 *
 * @param {string} address - The Ethereum address to validate.
 * @returns {boolean} - Returns true if valid, false otherwise.
 */
function isValidEthereumAddressFormat(address) {
  const regex = /^0x[a-fA-F0-9]{40}$/;
  return regex.test(address);
}

/**
 * Validates an Ethereum address using ethers.js (includes checksum validation).
 *
 * @param {string} address - The Ethereum address to validate.
 * @returns {boolean} - Returns true if valid, false otherwise.
 */
function isValidEthereumAddress(address) {
  try {
    ethers.utils.getAddress(address);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Reads addresses from a JSON file.
 *
 * @param {string} filePath - Path to the JSON file.
 * @returns {string[]} - Array of addresses.
 */
function readAddressesFromFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileContent);
    return data.addresses || [];
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return [];
  }
}

/**
 * Validates addresses and logs results.
 *
 * @param {string[]} addresses - Array of addresses to validate.
 * @param {string} listName - Name of the address list for logging.
 */
function validateAddresses(addresses, listName) {
  console.log(`\nValidating addresses from ${listName}:`);
  addresses.forEach((address, index) => {
    const isFormatValid = isValidEthereumAddressFormat(address);
    const isChecksumValid = isValidEthereumAddress(address);
    const checksumAddress = isChecksumValid ? ethers.utils.getAddress(address) : 'N/A';

    console.log(`Address ${index + 1}:`);
    console.log(`  Original: ${address}`);
    console.log(`  Format Valid: ${isFormatValid}`);
    console.log(`  Checksum Valid: ${isChecksumValid}`);
    console.log(`  Checksum Address: ${checksumAddress}`);
  });
}

// Main execution
const lcBurnerAddressesPath = path.join(
  __dirname,
  'data',
  'nftUserDelegateWhitelistBaseSepoliaTestNet.json',
);
const nftOwnerAddressesPath = path.join(__dirname, 'data', 'tokenHolderWhitelistBaseSepolia.json');

const lcBurnerAddresses = readAddressesFromFile(lcBurnerAddressesPath);
const nftOwnerAddresses = readAddressesFromFile(nftOwnerAddressesPath);

validateAddresses(lcBurnerAddresses, 'LC Burner Addresses');
validateAddresses(nftOwnerAddresses, 'NFT Owner Addresses');
