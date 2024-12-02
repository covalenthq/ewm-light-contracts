const hre = require('hardhat');
const { ethers } = require('hardhat');
require('dotenv').config();

async function setControllerNftBaseUrl() {
  const [owner] = await ethers.getSigners();

  console.log('Setting NFT base URL with the account:', owner.address);
  console.log('Account balance:', (await owner.getBalance()).toString());

  const NFT_CONTROLLER_ADDRESS = process.env.BASE_SEPOLIA_NFT_CONTROLLER;

  if (!NFT_CONTROLLER_ADDRESS) {
    throw new Error('Required environment variable BASE_SEPOLIA_NFT_CONTROLLER is not set');
  }

  console.log('NFT Controller Address:', NFT_CONTROLLER_ADDRESS);

  const EwmNftController = await hre.ethers.getContractFactory('EwmNftController');
  const nftController = await EwmNftController.attach(NFT_CONTROLLER_ADDRESS);

  const baseUrl = 'https://storage.googleapis.com/ewm-lc/';
  console.log('Setting base URL to:', baseUrl);

  const tx = await nftController.connect(owner).setBaseUrl(baseUrl);
  await tx.wait();

  console.log('Base URL set successfully');

  // Verify the update
  const newBaseUrl = await nftController.baseUrl();
  console.log('New base URL:', newBaseUrl);

  if (newBaseUrl === baseUrl) {
    console.log('Base URL successfully updated');
  } else {
    console.log('Warning: New base URL does not match the input');
  }
}

async function main() {
  try {
    await hre.run('compile');
    await setControllerNftBaseUrl();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
