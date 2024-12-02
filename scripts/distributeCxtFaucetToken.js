const hre = require('hardhat');
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function distributeCxtTokens() {
  const [owner] = await ethers.getSigners();

  console.log('Distributing CXT tokens with the account:', owner.address);
  console.log('Account balance:', (await owner.getBalance()).toString());

  const CXT_FAUCET_ADDRESS = process.env.BASE_SEPOLIA_CXT_FAUCET;

  if (!CXT_FAUCET_ADDRESS) {
    throw new Error('Required environment variables are not set');
  }

  // Read whitelist addresses from JSON file
  const whitelistFile = path.join(__dirname, 'data', 'tokenHolderWhitelistBaseSepolia.json');

  let whitelistAddresses;
  try {
    const fileContent = fs.readFileSync(whitelistFile, 'utf8');
    const fileData = JSON.parse(fileContent);
    whitelistAddresses = fileData.addresses;
  } catch (error) {
    console.error('Error reading whitelist file:', error);
    process.exit(1);
  }

  // Specify which indices to distribute to and their NFT counts
  const distributionConfig = {
    0: 366, // First address gets 67 NFTs
    // 1: 67, // Second address gets 67 NFTs
    // 2: 100, // Third address gets 100 NFTs
    // 3: 200, // Fourth address gets 100 NFTs
  };

  const NFT_PRICE = ethers.utils.parseUnits('5000', 18); // 5000 CXT per NFT

  // Create distribution data only for specified indices
  const whitelistData = Object.entries(distributionConfig).map(([index, nftCount]) => ({
    address: whitelistAddresses[index],
    nftCount,
    index: parseInt(index),
  }));

  console.log('\n=== Distribution Configuration ===');
  console.log('CXT Faucet Address:', CXT_FAUCET_ADDRESS);
  console.log('NFT Price:', ethers.utils.formatUnits(NFT_PRICE, 18), 'CXT');

  console.log('\n=== Distribution Details ===');
  whitelistData.forEach(({ address, nftCount, index }) => {
    console.log(`Index ${index}: ${address} will receive tokens for ${nftCount} NFTs`);
    console.log(`Amount: ${ethers.utils.formatUnits(NFT_PRICE.mul(nftCount), 18)} CXT\n`);
  });

  const CxtFaucet = await hre.ethers.getContractFactory('CovalentXTokenFaucet');
  const cxtFaucet = await CxtFaucet.attach(CXT_FAUCET_ADDRESS);

  console.log('\n=== Starting Distribution ===');
  for (const { address, nftCount, index } of whitelistData) {
    const distributionAmount = NFT_PRICE.mul(nftCount);

    try {
      const tx = await cxtFaucet.connect(owner).faucet(address, distributionAmount);
      const receipt = await tx.wait();
      console.log(
        `✅ Index ${index}: Transferred ${ethers.utils.formatUnits(distributionAmount, 18)} CXT to ${address}`,
      );
      console.log(`   Transaction hash: ${receipt.transactionHash}\n`);
    } catch (error) {
      console.error(`❌ Error transferring tokens to index ${index} (${address}):`, error.message);
    }
  }

  console.log('\n=== Distribution Summary ===');
  const balance = await cxtFaucet.balanceOf(owner.address);
  console.log('Remaining CXT balance of owner:', ethers.utils.formatUnits(balance, 18));

  // Calculate total distributed
  const totalDistributed = whitelistData.reduce(
    (acc, { nftCount }) => acc.add(NFT_PRICE.mul(nftCount)),
    ethers.BigNumber.from(0),
  );
  console.log('Total CXT distributed:', ethers.utils.formatUnits(totalDistributed, 18));
}

async function main() {
  try {
    await hre.run('compile');
    await distributeCxtTokens();
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
