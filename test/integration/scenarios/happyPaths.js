const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const {
  impersonateAll,
  getAdmin,
  getTokenHolders,
  getOwner,
  oneToken,
  generateMerkleTree,
  generateMerkleProof,
  getRewardsManager,
  deployCxtFaucet,
  depositReward,
  giveEth,
  getDelegators,
} = require('../../helpers');

describe('EWM Light Client NFT - Full Integration Scenario', () => {
  let cxtContract;
  let controllerContract;
  let claimContract;
  let allowanceContract;
  let owner;
  let admin;
  let rewarder;
  let startTime;
  let endTime;
  let nftExpiryTime;
  let user1;
  let user2;
  let user3;
  let tokenHolderAddresses;
  let delegatorAddresses;
  let firstThreeTokenHolderAddresses;

  const stakePrice = oneToken.mul(2500);
  const maxTotalStakeable = oneToken.mul(500000);
  const userCount = 3;

  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    admin = await getAdmin();
    rewarder = await getRewardsManager();
    delegatorAddresses = await getDelegators();

    // Deploy CXT Faucet contract
    cxtContract = await deployCxtFaucet();

    // Set up times
    const currentBlock = await ethers.provider.getBlock('latest');
    startTime = currentBlock.timestamp + 7 * 24 * 60 * 60; // 1 week from now
    endTime = startTime + 7 * 24 * 60 * 60; // 1 week after startTime
    nftExpiryTime = startTime + 53 * 7 * 24 * 60 * 60; // 1 year + 1 week from startTime

    // Deploy controller contract
    const controller = await ethers.getContractFactory('EwmNftController', owner);
    controllerContract = await upgrades.deployProxy(
      controller,
      [cxtContract.address, owner.address, owner.address, owner.address, rewarder.address],
      { initializer: 'initialize' },
    );
    await controllerContract.deployed();

    await controllerContract.updateMinterAdmin(admin.address);
    await controllerContract.updateWhitelistAdmin(admin.address);
    await controllerContract.updateBanAdmin(admin.address);
    await controllerContract.updateRewardAdmin(rewarder.address);
    await depositReward(cxtContract, controllerContract, oneToken.mul(100));

    // Deploy claim contract
    const claim = await ethers.getContractFactory('EwmNftClaim', owner);
    claimContract = await claim.deploy(controllerContract.address, admin.address);
    await claimContract.deployed();

    // Update minterAdmin on controller contract
    await controllerContract.updateMinterAdmin(claimContract.address);

    // Deploy allowance contract
    const allowance = await ethers.getContractFactory('EwmNftAllowance', owner);
    allowanceContract = await allowance.deploy(
      stakePrice,
      cxtContract.address,
      controllerContract.address,
      startTime,
      endTime,
      maxTotalStakeable,
      nftExpiryTime,
    );
    await allowanceContract.deployed();

    // Register allowance contract in claim contract
    await claimContract.connect(admin).updateAllowanceContractsArray([allowanceContract.address]);
    await claimContract.connect(owner).unpause();

    // Setup whitelist for allowance contract
    const tokenHolders = await getTokenHolders();
    tokenHolderAddresses = tokenHolders.slice(0, 3).map((holder) => holder.address);
    firstThreeTokenHolderAddresses = tokenHolderAddresses.slice(0, 3);

    [user1, user2, user3] = firstThreeTokenHolderAddresses.map((address) =>
      ethers.provider.getSigner(address),
    );
    const merkleTree = generateMerkleTree(firstThreeTokenHolderAddresses);
    const rootHash = merkleTree.getHexRoot();
    await allowanceContract.connect(owner).setWhitelistRootHash(rootHash);

    // Set integer allocation
    await allowanceContract.connect(owner).setIsIntegerAllocation(true);

    // Setup for controller contract
    await controllerContract
      .connect(owner)
      .setBaseUrl('https://storage.googleapis.com/covalent-project/emw-lc/');

    // Set up transfer whitelist for controller
    await controllerContract.connect(admin).updateTransferWhiteList([claimContract.address], true);
    await controllerContract
      .connect(admin)
      .updateWhitelistTransferTime(0, Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60);
    await controllerContract.connect(owner).setExpiryRange(1, 100, nftExpiryTime);
    // Give CXT to users
    const cxtAmount = stakePrice.mul(10);
    await cxtContract.connect(owner).faucet(tokenHolderAddresses[0], cxtAmount);
    await cxtContract.connect(owner).faucet(tokenHolderAddresses[1], cxtAmount);
    await cxtContract.connect(owner).faucet(tokenHolderAddresses[2], cxtAmount);

    // const controllerMetadata = await controllerContract.getMetadata();
    // console.log('Controller metadata:\n', controllerMetadata);

    // const allowanceMetadata = await allowanceContract.getMetadata();
    // console.log('Allowance metadata:\n', allowanceMetadata);

    // const claimMetadata = await claimContract.getMetadata();
    // console.log('Claim metadata:\n', claimMetadata);
  });

  it('Should allow users to stake and get NFT allowances', async () => {
    // Set the next block timestamp to startTime
    await ethers.provider.send('evm_setNextBlockTimestamp', [startTime]);
    await ethers.provider.send('evm_mine');

    for (const user of [user1, user2, user3]) {
      const userAddress = await user.getAddress();
      const proof = generateMerkleProof(firstThreeTokenHolderAddresses, userAddress);

      // Approve the allowance contract to spend CXT tokens
      await cxtContract.connect(user).approve(allowanceContract.address, stakePrice);

      // Perform whitelisted allocation
      await allowanceContract.connect(user).whitelistedAllocation(1, proof);
      // Check the allocation after the transaction
      const allocation = await allowanceContract.totalNftToMint(userAddress);
      expect(allocation).to.equal(1);
      // console.log('user nft to mint:', await allowanceContract.totalNftToMint(userAddress));
    }
  });

  it('Should allow admin to batch claim NFTs', async () => {
    // Set the next block timestamp to after the allocation period
    await ethers.provider.send('evm_setNextBlockTimestamp', [endTime + 1]);
    await ethers.provider.send('evm_mine');

    const user1Address = await user1.getAddress();
    const user2Address = await user2.getAddress();
    const user3Address = await user3.getAddress();

    // First, let's check how many NFTs are left to claim
    const unclaimedUser1 = await claimContract.unClaimedNftCount(user1Address);
    const unclaimedUser2 = await claimContract.unClaimedNftCount(user2Address);
    const unclaimedUser3 = await claimContract.unClaimedNftCount(user3Address);

    //Perform admin batch claim
    await expect(
      claimContract.connect(admin).adminBatchClaimAll([user1Address, user2Address, user3Address]),
    )
      .to.emit(claimContract, 'EventClaim')
      .withArgs(user1Address, unclaimedUser1)
      .and.to.emit(claimContract, 'EventClaim')
      .withArgs(user2Address, unclaimedUser2)
      .and.to.emit(claimContract, 'EventClaim')
      .withArgs(user3Address, unclaimedUser3);

    // Check if NFTs were minted and transferred
    for (const user of [user1, user2, user3]) {
      const userAddress = await user.getAddress();
      const balance = await controllerContract.balanceOf(userAddress);
      expect(balance).to.equal(1);
    }
  });

  it('Should allow rewarding NFT holders', async () => {
    await giveEth('10.0', [rewarder]);
    // Set up delegator for testing otherwise rewards will not be disbursed
    for (let i = 0; i < 3; i++) {
      const tokenId = i + 1;
      const delegator = await ethers.getSigner(delegatorAddresses[i].address);
      // 1 hour from now
      await controllerContract
        .connect(await ethers.getSigner(tokenHolderAddresses[i]))
        .setUser(tokenId, delegator.address);
    }
    const rewardAmount = oneToken.mul(1);

    const tokenIds = await Promise.all(
      [user1, user2, user3].map(async (user) => {
        const userAddress = await user.getAddress();
        return controllerContract.tokenOfOwnerByIndex(userAddress, 0);
      }),
    );

    const amounts = Array(userCount).fill(rewardAmount);
    const initialRewardPool = await controllerContract.rewardPool();
    const totalReward = amounts.reduce((a, b) => a.add(b), ethers.BigNumber.from(0));

    await expect(controllerContract.connect(rewarder).rewardTokenIds(tokenIds, amounts))
      .to.emit(controllerContract, 'EventRewardsDisbursed')
      .withArgs(tokenIds.length);

    // Check rewards
    for (let i = 0; i < tokenIds.length; i++) {
      const userInfo = await controllerContract.getUserInfo(tokenIds[i]);
      expect(userInfo.redeemable).to.equal(amounts[i]);
    }

    const finalRewardPool = await controllerContract.rewardPool();
    expect(finalRewardPool).to.equal(initialRewardPool.sub(totalReward));
  });

  it('Should allow users to redeem rewards', async () => {
    const initialContractBalance = await cxtContract.balanceOf(controllerContract.address);
    let totalRedeemed = ethers.BigNumber.from(0);

    for (const user of [user1, user2, user3]) {
      const userAddress = await user.getAddress();
      const tokenId = await controllerContract.tokenOfOwnerByIndex(userAddress, 0);

      const userInfoBefore = await controllerContract.getUserInfo(tokenId);
      const redeemableAmount = userInfoBefore.redeemable;

      const initialUserBalance = await cxtContract.balanceOf(userAddress);

      await expect(controllerContract.connect(user).redeemRewards())
        .to.emit(controllerContract, 'EventRewardsRedeemed')
        .withArgs(userAddress, redeemableAmount).to.not.be.reverted;

      const userInfoAfter = await controllerContract.getUserInfo(tokenId);
      expect(userInfoAfter.redeemable).to.equal(0);

      const finalUserBalance = await cxtContract.balanceOf(userAddress);
      expect(finalUserBalance).to.equal(initialUserBalance.add(redeemableAmount));

      totalRedeemed = totalRedeemed.add(redeemableAmount);
    }

    // Check that the controller contract's CXT balance has decreased by the total amount redeemed
    const finalContractBalance = await cxtContract.balanceOf(controllerContract.address);
    expect(finalContractBalance).to.equal(initialContractBalance.sub(totalRedeemed));
  });

  it('Should allow users to release allowance after NFT expiry', async () => {
    // Set the next block timestamp to after NFT expiry
    await ethers.provider.send('evm_setNextBlockTimestamp', [nftExpiryTime + 1]);
    await ethers.provider.send('evm_mine');

    for (const user of [user1, user2, user3]) {
      const userAddress = await user.getAddress();
      const initialBalance = await cxtContract.balanceOf(userAddress);

      await allowanceContract.connect(user).releaseNftStake(1);

      const finalBalance = await cxtContract.balanceOf(userAddress);
      expect(finalBalance.sub(initialBalance)).to.equal(stakePrice);
    }
  });

  it('Should have correct final balances for users post allowance release', async () => {
    const expectedBalance = stakePrice.mul(10).add(oneToken.mul(1));

    for (const user of [user1, user2, user3]) {
      const userAddress = await user.getAddress();
      const finalBalance = await cxtContract.balanceOf(userAddress);
      expect(finalBalance).to.equal(expectedBalance);
    }
  });
});
