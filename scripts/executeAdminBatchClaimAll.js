const hre = require('hardhat');
const { ethers } = require('hardhat');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function adminBatchClaimNfts() {
  const [, claimAdmin] = await ethers.getSigners();

  console.log('Performing admin batch claim with the account:', claimAdmin.address);
  console.log('Account balance:', (await claimAdmin.getBalance()).toString());

  const NFT_CLAIM_ADDRESS = process.env.BASE_SEPOLIA_NFT_CLAIM;
  const NFT_CONTROLLER_ADDRESS = process.env.BASE_SEPOLIA_NFT_CONTROLLER;

  if (!NFT_CLAIM_ADDRESS || !NFT_CONTROLLER_ADDRESS) {
    throw new Error('Required environment variables are not set');
  }

  console.log('NFT Claim Address:', NFT_CLAIM_ADDRESS);
  console.log('NFT Controller Address:', NFT_CONTROLLER_ADDRESS);

  // Read whitelist addresses from JSON file
  const whitelistFile = path.join(
    __dirname,
    '..',
    'scripts',
    'data',
    'tokenHolderWhitelistBaseSepolia.json',
  );
  let whitelistAddresses;
  try {
    const fileContent = fs.readFileSync(whitelistFile, 'utf8');
    const fileData = JSON.parse(fileContent);
    whitelistAddresses = fileData.addresses;
  } catch (error) {
    console.error('Error reading whitelist file:', error);
    process.exit(1);
  }

  // Get the NFT Claim contract instance
  const EwmNftClaim = await hre.ethers.getContractFactory('EwmNftClaim');
  const claimContract = await EwmNftClaim.attach(NFT_CLAIM_ADDRESS);

  // Get the NFT Controller contract instance
  const EwmNftController = await hre.ethers.getContractFactory('EwmNftController');
  const controllerContract = await EwmNftController.attach(NFT_CONTROLLER_ADDRESS);

  console.log('Checking unclaimed NFT counts for each address...');
  const unclaimedCounts = await Promise.all(
    whitelistAddresses.map(async (address) => {
      const count = await claimContract.unClaimedNftCount(address);
      console.log(`Address: ${address}, Unclaimed NFT count: ${count.toString()}`);
      return { address, unclaimedCount: count.toNumber() };
    }),
  );

  // Filter out addresses with 0 unclaimed NFTs
  const addressesToClaim = unclaimedCounts
    .filter(({ unclaimedCount }) => unclaimedCount > 0)
    .map(({ address }) => address);

  if (addressesToClaim.length === 0) {
    console.log('No addresses with unclaimed NFTs found.');
    return;
  }

  console.log('Addresses to claim:', addressesToClaim);
  console.log('Unclaimed counts:', unclaimedCounts);

  // Perform admin batch claim
  try {
    const tx = await claimContract.connect(claimAdmin).adminBatchClaimAll(addressesToClaim);
    await tx.wait();
    console.log('Admin batch claim successful');
  } catch (error) {
    console.error('Error performing admin batch claim:', error.message);
    return;
  }

  // Check NFT balances after claim
  for (const address of addressesToClaim) {
    const balance = await controllerContract.balanceOf(address);
    console.log(`NFT balance for ${address}: ${balance.toString()}`);
  }
}

async function main() {
  try {
    await hre.run('compile');
    await adminBatchClaimNfts();
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
