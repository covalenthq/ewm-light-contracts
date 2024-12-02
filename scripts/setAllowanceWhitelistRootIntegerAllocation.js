const hre = require('hardhat');
const { ethers } = require('hardhat');
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setWhitelistMerkleRoot() {
  const [owner] = await ethers.getSigners();

  console.log('Setting whitelist merkle root with the account:', owner.address);
  console.log('Account balance:', (await owner.getBalance()).toString());

  // Get addresses from environment variables
  const NFT_ALLOWANCE_ADDRESS = process.env.BASE_SEPOLIA_NFT_ALLOWANCE;

  // Ensure the required environment variables are set
  if (!NFT_ALLOWANCE_ADDRESS) {
    throw new Error('Required environment variables are not set');
  }

  console.log('NFT Allowance Address:', NFT_ALLOWANCE_ADDRESS);

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

  console.log('Whitelist addresses:', whitelistAddresses);

  // Generate Merkle Tree
  const leafNodes = whitelistAddresses.map((addr) => keccak256(addr));
  const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
  const rootHash = merkleTree.getRoot();

  console.log('Merkle Root:', rootHash.toString('hex'));

  // Get the NFT Allowance contract instance
  const EwmNftAllowance = await hre.ethers.getContractFactory('EwmNftAllowance');
  const nftAllowance = await EwmNftAllowance.attach(NFT_ALLOWANCE_ADDRESS);

  console.log('Setting whitelist root hash...');
  console.log('NFT Allowance Address:', nftAllowance.address);

  //Set the whitelist root hash
  const tx = await nftAllowance
    .connect(owner)
    .setWhitelistRootHash('0x' + rootHash.toString('hex'));
  await tx.wait();

  console.log('Whitelist root hash set successfully');

  // Verify the update
  const newRootHash = await nftAllowance.whitelistRootHash();
  console.log('New whitelist root hash:', newRootHash);

  if (newRootHash === '0x' + rootHash.toString('hex')) {
    console.log('Whitelist root hash successfully updated');
  } else {
    console.log('Warning: New whitelist root hash does not match the input');
  }

  // Set isIntegerAllocation to true
  console.log('Setting isIntegerAllocation to true...');
  const setIntegerAllocationTx = await nftAllowance.connect(owner).setIsIntegerAllocation(false);
  await setIntegerAllocationTx.wait();

  console.log('isIntegerAllocation set successfully');

  // Verify the update
  const isIntegerAllocation = await nftAllowance.isIntegerAllowance();
  console.log('New isIntegerAllocation value:', isIntegerAllocation);

  if (isIntegerAllocation) {
    console.log('isIntegerAllocation successfully set to true');
  } else {
    console.log('Warning: isIntegerAllocation is not set to true');
  }
}

async function main() {
  try {
    await hre.run('compile');
    await setWhitelistMerkleRoot();
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
