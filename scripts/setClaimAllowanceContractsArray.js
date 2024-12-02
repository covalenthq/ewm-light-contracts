const hre = require('hardhat');
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function updateAllowanceContractsArray() {
  const [owner, claimAdmin] = await ethers.getSigners();

  console.log('Updating allowance contracts array with the account:', claimAdmin.address);
  console.log('Account balance:', (await owner.getBalance()).toString());
  console.log('Claim Admin balance:', (await claimAdmin.getBalance()).toString());

  // Get addresses from environment variables
  const NFT_CLAIM_ADDRESS = process.env.BASE_SEPOLIA_NFT_CLAIM;

  // Ensure the required environment variables are set
  if (!NFT_CLAIM_ADDRESS) {
    throw new Error('Required environment variables are not set');
  }

  console.log('NFT Claim Address:', NFT_CLAIM_ADDRESS);

  // Read allowance contract addresses from JSON file
  const allowanceContractsFile = path.join(
    __dirname,
    '..',
    'scripts',
    'data',
    'allowanceContractsArrayBaseSepolia.json', //change this to the correct file for different networks
  );
  let allowanceContracts;
  try {
    if (fs.existsSync(allowanceContractsFile)) {
      const fileContent = fs.readFileSync(allowanceContractsFile, 'utf8');
      const fileData = JSON.parse(fileContent);

      if (Array.isArray(fileData)) {
        allowanceContracts = fileData;
      } else if (Array.isArray(fileData.addresses)) {
        allowanceContracts = fileData.addresses;
      } else {
        throw new Error('Invalid file format');
      }
    } else {
      console.log('Allowance contracts file not found. Creating a new one with an empty array.');
      allowanceContracts = [];
      fs.writeFileSync(allowanceContractsFile, JSON.stringify(allowanceContracts, null, 2));
    }
  } catch (error) {
    console.error('Error reading or creating allowance contracts file:', error);
    process.exit(1);
  }

  console.log('Allowance contracts to be set:', allowanceContracts);

  // Get the NFT Claim contract instance
  const EwmNftClaim = await hre.ethers.getContractFactory('EwmNftClaim');
  const nftClaim = await EwmNftClaim.attach(NFT_CLAIM_ADDRESS);

  console.log('Updating allowance contracts array...');
  console.log('NFT Claim Address:', nftClaim.address);

  // Update the allowance contracts array
  const tx = await nftClaim.connect(claimAdmin).updateAllowanceContractsArray(allowanceContracts);
  await tx.wait();

  console.log('Allowance contracts array updated successfully');

  // Verify the update
  const newAllowanceContracts = await nftClaim.getAllowanceContractsArray();
  console.log('New allowance contracts array:', newAllowanceContracts);

  // Check if the arrays match
  const match = JSON.stringify(newAllowanceContracts) === JSON.stringify(allowanceContracts);
  if (match) {
    console.log('Allowance contracts array successfully updated');
  } else {
    console.log('Warning: New allowance contracts array does not match the input');
  }
}

async function main() {
  try {
    await hre.run('compile');
    await updateAllowanceContractsArray();
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
