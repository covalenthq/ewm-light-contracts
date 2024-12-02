const hre = require('hardhat');
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setNftExpiryRange() {
  const [owner] = await ethers.getSigners();

  console.log('Setting NFT expiry range with the account:', owner.address);
  console.log('Account balance:', (await owner.getBalance()).toString());

  const NFT_CONTROLLER_ADDRESS = process.env.BASE_SEPOLIA_NFT_CONTROLLER;

  if (!NFT_CONTROLLER_ADDRESS) {
    throw new Error('Required environment variables are not set');
  }

  console.log('NFT Controller Address:', NFT_CONTROLLER_ADDRESS);

  // Read expiry ranges from JSON file
  const expiryRangeFile = path.join(__dirname, 'data', 'nftExpiryRanges.json');
  let expiryRanges;
  try {
    const fileContent = fs.readFileSync(expiryRangeFile, 'utf8');
    expiryRanges = JSON.parse(fileContent);
  } catch (error) {
    console.error('Error reading expiry range file:', error);
    process.exit(1);
  }

  // Get the NFT Controller contract instance
  const EwmNftController = await hre.ethers.getContractFactory('EwmNftController');
  const nftController = await EwmNftController.attach(NFT_CONTROLLER_ADDRESS);

  console.log('Setting expiry ranges...');

  for (const range of expiryRanges) {
    const { startTokenId, endTokenId, expiryTime } = range;
    console.log(
      `Setting range: ${startTokenId} - ${endTokenId}, Expiry: ${new Date(expiryTime * 1000).toISOString()}`,
    );

    try {
      const tx = await nftController
        .connect(owner)
        .setExpiryRange(startTokenId, endTokenId, expiryTime);
      await tx.wait();
      console.log(`Range set successfully for tokens ${startTokenId} - ${endTokenId}`);
    } catch (error) {
      console.error(
        `Error setting range for tokens ${startTokenId} - ${endTokenId}:`,
        error.message,
      );
    }
  }

  console.log('All expiry ranges set successfully');

  // Verify the updates
  console.log('Verifying expiry ranges...');
  for (const range of expiryRanges) {
    const { startTokenId, endTokenId } = range;
    const midTokenId = Math.floor((startTokenId + endTokenId) / 2);
    const expiryTime = await nftController.userExpires(midTokenId);
    console.log(`Token ${midTokenId} expiry: ${new Date(expiryTime * 1000).toISOString()}`);
  }
}

async function main() {
  try {
    await hre.run('compile');
    await setNftExpiryRange();
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
