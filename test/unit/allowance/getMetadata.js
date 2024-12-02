const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const {
  impersonateAll,
  getTokenHolders,
  getOwner,
  oneToken,
  generateMerkleTree,
  generateMerkleProof,
  deployCxtFaucet,
  getRewardsManager,
} = require('../../helpers');

describe('EwmNftAllowance - getMetadata', () => {
  let allowanceContract;
  let controllerContract;
  let owner;
  let user1;
  let user2;
  let user3;
  let startTime;
  let endTime;
  let nftExpiryTime;
  let tokenHolderAddresses;
  let firstThreeTokenHolderAddresses;
  let cxtContract;
  let rewarder;
  const stakePrice = oneToken.mul(2500);
  const maxTotalStakeable = oneToken.mul(500000);

  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    cxtContract = await deployCxtFaucet();
    const tokenHolders = await getTokenHolders();
    rewarder = await getRewardsManager();
    tokenHolderAddresses = tokenHolders.slice(0, 3).map((holder) => holder.address);
    firstThreeTokenHolderAddresses = tokenHolderAddresses.slice(0, 3);

    [user1, user2, user3] = firstThreeTokenHolderAddresses.map((address) =>
      ethers.provider.getSigner(address),
    );

    // Deploy controller contract
    const controller = await ethers.getContractFactory('EwmNftController', owner);
    controllerContract = await upgrades.deployProxy(
      controller,
      [cxtContract.address, owner.address, owner.address, owner.address, rewarder.address],
      {
        initializer: 'initialize',
      },
    );
    await controllerContract.deployed();

    // Set up times
    const currentBlock = await ethers.provider.getBlock('latest');
    startTime = currentBlock.timestamp + 7 * 24 * 60 * 60; // 1 week from now
    endTime = startTime + 7 * 24 * 60 * 60; // 1 week after startTime
    nftExpiryTime = startTime + 53 * 7 * 24 * 60 * 60; // 1 year + 1 week from startTime

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

    // Setup whitelist for allowance contract
    const merkleTree = generateMerkleTree(firstThreeTokenHolderAddresses);
    const rootHash = merkleTree.getHexRoot();
    await allowanceContract.setWhitelistRootHash(rootHash);

    // Set integer allocation
    await allowanceContract.setIsIntegerAllocation(true);

    // Distribute CXT tokens to users
    const cxtAmount = stakePrice.mul(10);
    for (const user of [user1, user2, user3]) {
      await cxtContract.connect(owner).faucet(await user.getAddress(), cxtAmount);
    }

    // Perform some allocations
    await ethers.provider.send('evm_setNextBlockTimestamp', [startTime]);
    await ethers.provider.send('evm_mine');

    for (const user of [user1, user2]) {
      const proof = generateMerkleProof(firstThreeTokenHolderAddresses, await user.getAddress());
      await cxtContract.connect(user).approve(allowanceContract.address, stakePrice);
      await allowanceContract.connect(user).whitelistedAllocation(1, proof);
    }
  });

  it('Should return the correct metadata', async () => {
    const metadata = await allowanceContract.getMetadata();
    expect(metadata._nftAllowance).to.equal(allowanceContract.address);
    expect(metadata._cxt).to.equal(cxtContract.address);
    expect(metadata._nftController).to.equal(controllerContract.address);
    expect(metadata._stakePrice).to.equal(stakePrice);
    expect(metadata._startTime).to.equal(startTime);
    expect(metadata._endTime).to.equal(endTime);
    expect(metadata._maxTotalStakeable).to.equal(maxTotalStakeable);
    expect(metadata._totalStakeReceived).to.equal(stakePrice.mul(2)); // Two allocations performed
    expect(metadata._nftExpiryTime).to.equal(nftExpiryTime);

    const merkleTree = generateMerkleTree(firstThreeTokenHolderAddresses);
    const rootHash = merkleTree.getHexRoot();
    expect(metadata._whitelistRootHash).to.equal(rootHash);

    expect(metadata._isIntegerAllowance).to.be.true;
  });

  it('Should update metadata when contract state changes', async () => {
    // Perform some allocations
    const newNftExpiryTime = nftExpiryTime + 86400; // Add one day
    await allowanceContract.connect(owner).setNftExpiryTime(newNftExpiryTime);

    const updatedMetadata = await allowanceContract.getMetadata();

    expect(updatedMetadata._nftExpiryTime).to.equal(newNftExpiryTime);
  });
});
