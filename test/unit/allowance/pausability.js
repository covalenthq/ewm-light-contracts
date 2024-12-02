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
} = require('../../helpers');

describe('EwmNftAllowance - Pausability', () => {
  let allowanceContract;
  let controllerContract;
  let owner;
  let admin;
  let user1;
  let user2;
  let startTime;
  let endTime;
  let nftExpiryTime;
  let rewarder;
  let tokenHolderAddresses;
  let firstThreeTokenHolderAddresses;
  let cxtContract;

  const stakePrice = oneToken.mul(2500);
  const maxTotalStakeable = oneToken.mul(500000);

  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    admin = await getAdmin();
    rewarder = await getRewardsManager();
    cxtContract = await deployCxtFaucet();
    const tokenHolders = await getTokenHolders();
    tokenHolderAddresses = tokenHolders.slice(0, 3).map((holder) => holder.address);
    firstThreeTokenHolderAddresses = tokenHolderAddresses.slice(0, 3);
    // eslint-disable-next-line no-undef
    [user1, user2, _] = firstThreeTokenHolderAddresses.map((address) =>
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

    // Setup for controller contract
    await controllerContract.setBaseUrl('https://storage.googleapis.com/covalent-project/emw-lc/');
    await controllerContract.updateMinterAdmin(admin.address);
    await controllerContract.updateWhitelistAdmin(admin.address);
    await controllerContract.updateBanAdmin(admin.address);
    await controllerContract.updateRewardAdmin(rewarder.address);

    // Setup whitelist for allowance contract
    const merkleTree = generateMerkleTree(firstThreeTokenHolderAddresses);
    const rootHash = merkleTree.getHexRoot();
    await allowanceContract.setWhitelistRootHash(rootHash);

    // Set integer allocation
    await allowanceContract.setIsIntegerAllocation(true);
    const cxtAmount = stakePrice.mul(10);
    const tx1 = await cxtContract.connect(owner).faucet(tokenHolderAddresses[0], cxtAmount);
    const tx2 = await cxtContract.connect(owner).faucet(tokenHolderAddresses[1], cxtAmount);
    const tx3 = await cxtContract.connect(owner).faucet(tokenHolderAddresses[2], cxtAmount);

    await tx1.wait();
    await tx2.wait();
    await tx3.wait();

    // Set up transfer whitelist for controller
    await controllerContract
      .connect(admin)
      .updateTransferWhiteList([admin.address, allowanceContract.address], true);
    await controllerContract
      .connect(admin)
      .updateWhitelistTransferTime(0, Math.floor(Date.now() / 1000) + 3600);
    await controllerContract
      .connect(owner)
      .setExpiryRange(1, 100, Math.floor(Date.now() / 1000) + 3600);
  });

  it('Should be unpaused after deployment', async () => {
    expect(await allowanceContract.paused()).to.be.false;
  });

  it('Should allow owner to pause the contract', async () => {
    await expect(allowanceContract.pause())
      .to.emit(allowanceContract, 'Paused')
      .withArgs(owner.address);

    expect(await allowanceContract.paused()).to.be.true;
  });

  it('Should not allow non-owner to pause the contract', async () => {
    await allowanceContract.unpause();
    await expect(allowanceContract.connect(admin).pause()).to.be.revertedWith(
      'Ownable: caller is not the owner',
    );
  });

  it('Should allow owner to unpause the contract', async () => {
    await allowanceContract.pause();
    await expect(allowanceContract.unpause())
      .to.emit(allowanceContract, 'Unpaused')
      .withArgs(owner.address);

    expect(await allowanceContract.paused()).to.be.false;
  });

  it('Should not allow non-owner to unpause the contract', async () => {
    await allowanceContract.pause();
    await expect(allowanceContract.connect(admin).unpause()).to.be.revertedWith(
      'Ownable: caller is not the owner',
    );
    await allowanceContract.unpause();
  });

  it('Should not allow pausing an already paused contract', async () => {
    await allowanceContract.pause();
    await expect(allowanceContract.pause()).to.be.revertedWith('Pausable: paused');
    await allowanceContract.unpause();
  });

  it('Should not allow unpausing an already unpaused contract', async () => {
    await expect(allowanceContract.unpause()).to.be.revertedWith('Pausable: not paused');
  });

  it('Should prevent whitelisted allocation when paused', async () => {
    await allowanceContract.pause();
    const proof = generateMerkleProof(firstThreeTokenHolderAddresses, user1.address);
    await expect(
      allowanceContract.connect(user1).whitelistedAllocation(1, proof),
    ).to.be.revertedWith('Pausable: paused');
    await allowanceContract.unpause();
  });

  it('Should allow whitelisted allocation when unpaused and during allocation period', async () => {
    // Set the next block timestamp to startTime
    await ethers.provider.send('evm_setNextBlockTimestamp', [startTime]);
    await ethers.provider.send('evm_mine');

    const proof = generateMerkleProof(firstThreeTokenHolderAddresses, await user1.getAddress());

    // Approve the allowance contract to spend CQT tokens
    await cxtContract.connect(user1).approve(allowanceContract.address, stakePrice);
    await allowanceContract.connect(user1).whitelistedAllocation(1, proof);

    // Check the allocation after the transaction
    const allocation = await allowanceContract.totalNftToMint(await user1.getAddress());
    expect(allocation).to.equal(1);
  });

  it('Should not allow setting max total stakeable less than current total stake', async () => {
    // First, perform some staking to increase totalStakeReceived
    const currentTotalStake = await allowanceContract.totalStakeReceived();
    const newMaxTotalStakeable = currentTotalStake.sub(1); // Set it to 1 less than current total stake

    await expect(
      allowanceContract.connect(owner).updateMaxTotalStakeable(newMaxTotalStakeable),
    ).to.be.revertedWith('New max must be greater than current total stake');
  });

  it('Should prevent setting whitelist root hash when paused', async () => {
    await allowanceContract.pause();
    await expect(
      allowanceContract.setWhitelistRootHash(ethers.constants.HashZero),
    ).to.be.revertedWith('Pausable: paused');
    await allowanceContract.unpause();
  });

  it('Should prevent setting integer allocation flag when paused', async () => {
    await allowanceContract.pause();
    await expect(allowanceContract.setIsIntegerAllocation(false)).to.be.revertedWith(
      'Pausable: paused',
    );
    await allowanceContract.unpause();
  });

  it('Should prevent whitelisted allocation from contracts that cannot receive ERC721', async () => {
    // Deploy mock contract
    const MockContract = await ethers.getContractFactory('MockNonERC721Receiver');
    const mockContract = await MockContract.deploy();
    await mockContract.deployed();

    // Set the token address first
    await mockContract.setToken(cxtContract.address);

    // Then approve the allowance contract
    await mockContract.approve(allowanceContract.address, stakePrice);

    // Create merkle proof and update root hash
    const addressesWithMock = [...firstThreeTokenHolderAddresses, mockContract.address];
    const merkleTree = generateMerkleTree(addressesWithMock);
    const rootHash = merkleTree.getHexRoot();
    await allowanceContract.setWhitelistRootHash(rootHash);

    const proof = generateMerkleProof(addressesWithMock, mockContract.address);

    // This should revert because the contract doesn't implement IERC721Receiver
    await expect(mockContract.tryWhitelistedAllocation(allowanceContract.address, 1, proof)).to.be
      .reverted;
  });

  it('Should not allow releasing nft stake before NFT expiry', async () => {
    const addressesWithoutMock = [...firstThreeTokenHolderAddresses];
    const merkleTree = generateMerkleTree(addressesWithoutMock);
    const rootHash = merkleTree.getHexRoot();
    await allowanceContract.setWhitelistRootHash(rootHash);
    const proof = generateMerkleProof(addressesWithoutMock, await user2.getAddress());
    await cxtContract.connect(user2).approve(allowanceContract.address, stakePrice);
    await allowanceContract.connect(user2).whitelistedAllocation(1, proof);
    await controllerContract.connect(owner).mint(await user2.getAddress(), 1);
    await ethers.provider.send('evm_setNextBlockTimestamp', [nftExpiryTime - 10]);
    await ethers.provider.send('evm_mine');
    await expect(allowanceContract.connect(user2).releaseNftStake(1)).to.be.revertedWith(
      'NFT expiry time has not passed',
    );
  });

  it('Should not allow releasing more nft stake than owned NFTs', async () => {
    await ethers.provider.send('evm_setNextBlockTimestamp', [nftExpiryTime + 1]);
    await ethers.provider.send('evm_mine');

    const ownedNFTs = await controllerContract.balanceOf(await user2.getAddress());
    await expect(
      allowanceContract.connect(user2).releaseNftStake(ownedNFTs.add(1)),
    ).to.be.revertedWith('Insufficient NFTs owned');
  });

  it('Should update state correctly after nft stake allowance', async () => {
    const initialStakeAmount = await allowanceContract.userStakeAmount(await user2.getAddress());
    const initialTotalStakeReceived = await allowanceContract.totalStakeReceived();
    const initialNftToMint = await allowanceContract.totalNftToMint(await user2.getAddress());

    await allowanceContract.connect(user2).releaseNftStake(1);

    const finalStakeAmount = await allowanceContract.userStakeAmount(await user2.getAddress());
    const finalTotalStakeReceived = await allowanceContract.totalStakeReceived();
    const finalNftToMint = await allowanceContract.totalNftToMint(await user2.getAddress());

    expect(finalStakeAmount).to.equal(initialStakeAmount.sub(stakePrice));
    expect(finalTotalStakeReceived).to.equal(initialTotalStakeReceived.sub(stakePrice));
    expect(finalNftToMint).to.equal(initialNftToMint.sub(1));
  });

  it('Should allow releasing nft stake when unpaused and after NFT expiry', async () => {
    // Mint an NFT to the user
    await controllerContract.connect(owner).mint(await user1.getAddress(), 1);

    const initialBalance = await cxtContract.balanceOf(await user1.getAddress());
    await expect(allowanceContract.connect(user1).releaseNftStake(1)).to.not.be.reverted;
    const finalBalance = await cxtContract.balanceOf(await user1.getAddress());

    expect(finalBalance.sub(initialBalance)).to.equal(stakePrice);
  });
});
