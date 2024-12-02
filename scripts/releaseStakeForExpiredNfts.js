const hre = require('hardhat');
const { ethers } = require('hardhat');
require('dotenv').config();

async function releaseNftStake() {
  const [owner] = await ethers.getSigners();
  const NFT_ALLOWANCE_ADDRESS = process.env.BASE_SEPOLIA_NFT_ALLOWANCE;
  const NFT_CONTROLLER_ADDRESS = process.env.BASE_SEPOLIA_NFT_CONTROLLER;
  const EWM_TOKEN_HOLDER_1_PK = process.env.EWM_TOKEN_HOLDER_1;
  const EWM_TOKEN_HOLDER_2_PK = process.env.EWM_TOKEN_HOLDER_2;
  const CXT_ADDRESS = process.env.BASE_SEPOLIA_CXT_FAUCET;

  if (
    !NFT_ALLOWANCE_ADDRESS ||
    !NFT_CONTROLLER_ADDRESS ||
    !EWM_TOKEN_HOLDER_1_PK ||
    !EWM_TOKEN_HOLDER_2_PK ||
    !CXT_ADDRESS
  ) {
    throw new Error('Required environment variables are not set');
  }

  const tokenHolder1 = new ethers.Wallet(EWM_TOKEN_HOLDER_1_PK, ethers.provider);
  const tokenHolder2 = new ethers.Wallet(EWM_TOKEN_HOLDER_2_PK, ethers.provider);

  console.log('Owner Address:', owner.address);
  console.log('Token Holder 1 Address:', tokenHolder1.address);
  console.log('Token Holder 2 Address:', tokenHolder2.address);

  const EwmNftAllowance = await hre.ethers.getContractFactory('EwmNftAllowance');
  const nftAllowance = await EwmNftAllowance.attach(NFT_ALLOWANCE_ADDRESS);
  console.log('NFT Allowance Contract:', nftAllowance.address);

  const CXT = await hre.ethers.getContractFactory('CovalentXTokenFaucet');
  const cxtToken = await CXT.attach(CXT_ADDRESS);

  // Check initial CXT balances
  const initialBalance1 = await cxtToken.balanceOf(tokenHolder1.address);
  const initialBalance2 = await cxtToken.balanceOf(tokenHolder2.address);
  console.log(
    'Initial CXT balance of Token Holder 1:',
    ethers.utils.formatUnits(initialBalance1, 18),
  );
  console.log(
    'Initial CXT balance of Token Holder 2:',
    ethers.utils.formatUnits(initialBalance2, 18),
  );

  // Set NFT expiry time to now
  //   const currentTime = Math.floor(Date.now() / 1000);
  //   console.log('Setting NFT expiry time to now...', currentTime);
  //   await nftAllowance.connect(owner).setNftExpiryTime(currentTime);
  //   console.log('NFT expiry time set successfully');

  //   // Wait for some time to ensure the expiry time has passed
  //   console.log('Waiting for 10 seconds...');
  //   await new Promise((resolve) => setTimeout(resolve, 10000));

  // Release allowance for Token Holder 1
  console.log('Releasing allowance for Token Holder 1...');
  const tx1 = await nftAllowance.connect(tokenHolder1).releaseNftStake(5);
  await tx1.wait();

  // Release allowance for Token Holder 2
  console.log('Releasing allowance for Token Holder 2...');
  const tx2 = await nftAllowance.connect(tokenHolder2).releaseNftStake(8);
  await tx2.wait();

  // Check final CXT balances
  const finalBalance1 = await cxtToken.balanceOf(tokenHolder1.address);
  const finalBalance2 = await cxtToken.balanceOf(tokenHolder2.address);
  console.log('Final CXT balance of Token Holder 1:', ethers.utils.formatUnits(finalBalance1, 18));
  console.log('Final CXT balance of Token Holder 2:', ethers.utils.formatUnits(finalBalance2, 18));

  // Calculate and verify the expected balance increases
  const stakePrice = ethers.utils.parseUnits('5000', 18);
  const expectedIncrease1 = stakePrice.mul(5);
  const expectedIncrease2 = stakePrice.mul(8);

  const actualIncrease1 = finalBalance1.sub(initialBalance1);
  const actualIncrease2 = finalBalance2.sub(initialBalance2);

  console.log(
    'Expected increase for Token Holder 1:',
    ethers.utils.formatUnits(expectedIncrease1, 18),
  );
  console.log('Actual increase for Token Holder 1:', ethers.utils.formatUnits(actualIncrease1, 18));
  console.log(
    'Expected increase for Token Holder 2:',
    ethers.utils.formatUnits(expectedIncrease2, 18),
  );
  console.log('Actual increase for Token Holder 2:', ethers.utils.formatUnits(actualIncrease2, 18));

  if (actualIncrease1.eq(expectedIncrease1) && actualIncrease2.eq(expectedIncrease2)) {
    console.log('Allowance release successful and balances are correct');
  } else {
    console.log('Warning: Actual balance increases do not match expected values');
  }
}

async function main() {
  try {
    await hre.run('compile');
    await releaseNftStake();
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
