const hre = require('hardhat');
const { ethers } = require('hardhat');
require('dotenv').config();

async function pauseClaimContract() {
  const [owner] = await ethers.getSigners();

  console.log('Pausing claim contract with the account:', owner.address);
  console.log('Account balance:', (await owner.getBalance()).toString());

  // Get addresses from environment variables
  const NFT_CLAIM_ADDRESS = process.env.BASE_SEPOLIA_NFT_CLAIM;

  // Ensure the required environment variables are set
  if (!NFT_CLAIM_ADDRESS) {
    throw new Error('Required environment variables are not set');
  }

  console.log('NFT Claim Address:', NFT_CLAIM_ADDRESS);

  // Get the NFT Claim contract instance
  const EwmNftClaim = await hre.ethers.getContractFactory('EwmNftClaim');
  const nftClaim = await EwmNftClaim.attach(NFT_CLAIM_ADDRESS);

  console.log('Checking current pause status...');
  const isPaused = await nftClaim.paused();
  console.log('Contract is currently paused:', isPaused);

  if (isPaused) {
    console.log('Contract is already paused. No action needed.');
    return;
  }

  console.log('Pausing the claim contract...');

  // Pause the contract
  const tx = await nftClaim.connect(owner).pause();
  await tx.wait();

  console.log('Claim contract paused successfully');

  // Verify the update
  const newPauseStatus = await nftClaim.paused();
  console.log('New pause status:', newPauseStatus);

  if (newPauseStatus) {
    console.log('Claim contract successfully paused');
  } else {
    console.log('Warning: Claim contract is still unpaused');
  }
}

async function main() {
  try {
    await hre.run('compile');
    await pauseClaimContract();
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
