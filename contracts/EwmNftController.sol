// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import '@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import './interfaces/IERC4907.sol';

contract EwmNftController is Ownable2StepUpgradeable, ERC721EnumerableUpgradeable, IERC4907 {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  uint256 public constant REWARD_REDEEM_THRESHOLD = 10 ** 8; // minimum number of tokens that can be redeemed
  struct UserInfo {
    address user; // address of user role
    uint64 expires; // unix timestamp, user expires
    uint256 redeemable; // amount of rewards available for redemption
  }

  struct ExpiryRange {
    uint256 startTokenId;
    uint256 endTokenId;
    uint64 expiryTime;
  }

  mapping(uint256 => UserInfo) internal _users; // mapping of tokenid to delegated burner address, their expiry and rewards redeemable (set to 0 after every redeem)
  mapping(uint256 => uint64) internal _banRecords; // mapping of tokenId to ban end timestamps
  mapping(address => bool) internal _transferWhitelist; // mapping of addresses to transfer minted nfts to true or false

  uint256 private _whitelistTransferStartTime;
  uint256 private _whitelistTransferEndTime;
  bool private _unpaused; // check if contract is paused

  IERC20Upgradeable public cxt; // cxt address associated with mint
  ExpiryRange[] public expiryRanges;

  address public minterAdminAddress;
  address public banAdminAddress;
  address public whitelistAdminAddress;
  uint256 public nextTokenId; // counter for tokenId
  uint256 public rewardPool; // reward pool for light clients
  address public rewardManager; // reward manager address for distributing funds from reward pool
  string public baseUrl; // nft metadata address
  bool public nftTransferable; // make the nft transferrable post expiry

  event EventWhiteListAdminUpdated(address newWhiteListAdmin);
  event EventMinterAdminUpdated(address newMinterAdmin);
  event EventBanAdminUpdated(address newBanAdmin);
  event EventNftTransferableUpdated(bool transferable);
  event EventBanUpdated(address tokenOwner, uint256 tokenId, uint64 banEndTime);
  event EventRewardManagerAddressChanged(address indexed operationalManager);
  event EventRewardsDisbursed(uint256 indexed rewardId);
  event EventRewardTokensDeposited(uint256 amount);
  event EventRewardTokensWithdrawn(uint256 amount);
  event EventInitialized(
    address indexed cxt,
    address minterAdminAddress,
    address banAdminAddress,
    address whitelistAdminAddress,
    address rewardManager,
    bool nftTransferable,
    uint256 nextTokenId,
    bool unpaused
  );
  event EventContractPaused(address account);
  event EventContractUnpaused(address account);
  event EventRewardsFailedDueNFTExpired(uint256 indexed tokenId, uint256 amount);
  event EventBaseUrlSet(string url_);
  event EventRewardsRedeemed(address indexed beneficiary, uint256 indexed amount);
  event EventExpiryRangeSet(uint256 startTokenId, uint256 endTokenId, uint64 expiryTime);
  event EventExpiryRangeUpdated(
    uint256 index,
    uint256 startTokenId,
    uint256 endTokenId,
    uint64 expiryTime
  );
  event EventTransferWhiteListUpdated(address[] addresses, bool status);
  event EventWhitelistTransferTimeUpdated(uint256 startTime, uint256 endTime);

  modifier onlyRewardManager() {
    require(rewardManager == msg.sender, 'Caller is not rewardManager role');
    _;
  }

  modifier onlyWhitelistAdmin() {
    require(msg.sender == whitelistAdminAddress, 'only whitelist admin');
    _;
  }

  modifier onlyBanAdmin() {
    require(msg.sender == banAdminAddress, 'only ban admin');
    _;
  }

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  function initialize(
    address _cxt,
    address minterAdmin,
    address banAdmin,
    address whitelistAdmin,
    address rewardAdmin
  ) public initializer {
    require(_cxt != address(0), 'Zero address not allowed for CXT token');
    require(minterAdmin != address(0), 'Zero address not allowed for minter admin');
    require(banAdmin != address(0), 'Zero address not allowed for ban admin');
    require(whitelistAdmin != address(0), 'Zero address not allowed for whitelist admin');
    require(rewardAdmin != address(0), 'Zero address not allowed for reward admin');

    __ERC721_init('EWM Light-Client (CXT) Controller', 'EWMLCC');
    __Ownable2Step_init();
    cxt = IERC20Upgradeable(_cxt);
    minterAdminAddress = minterAdmin;
    banAdminAddress = banAdmin;
    whitelistAdminAddress = whitelistAdmin;
    rewardManager = rewardAdmin;
    nftTransferable = false;
    nextTokenId = 1;
    _unpaused = true;

    emit EventInitialized(
      address(cxt),
      minterAdminAddress,
      banAdminAddress,
      whitelistAdminAddress,
      rewardManager,
      nftTransferable,
      nextTokenId,
      _unpaused
    );
  }

  // NFT claim contracts can call this function to mint NFTs
  function mint(address to, uint256 amount) public whenNotPaused {
    require(to != address(0), 'Zero address not allowed for mint recipient');
    require(msg.sender == minterAdminAddress || msg.sender == owner(), 'caller is not the minter');
    for (uint256 i = 0; i < amount; i++) {
      _mintOne(to);
    }
  }

  function _mintOne(address to) internal {
    _mint(to, nextTokenId);
    nextTokenId++; // Monotonic increment to tokenIds on mint
  }

  function _baseURI() internal view virtual override returns (string memory) {
    return baseUrl;
  }

  // Set metadata base url for generated NFTs
  function setBaseUrl(string calldata url_) public onlyOwner {
    baseUrl = url_;
    emit EventBaseUrlSet(url_);
  }

  function setExpiryRange(uint256 startId, uint256 endId, uint64 expiryTime) public onlyOwner {
    require(startId <= endId, 'Invalid range');

    if (expiryRanges.length > 0) {
      ExpiryRange storage lastRange = expiryRanges[expiryRanges.length - 1];
      require(startId > lastRange.endTokenId, 'New range overlaps with existing range');
    }

    expiryRanges.push(ExpiryRange(startId, endId, expiryTime));
    emit EventExpiryRangeSet(startId, endId, expiryTime);
  }

  function updateExpiryRange(
    uint256 index,
    uint256 startId,
    uint256 endId,
    uint64 expiryTime
  ) public onlyOwner {
    require(index < expiryRanges.length, 'Invalid index');
    require(startId <= endId, 'Invalid range');

    if (index > 0) {
      require(startId > expiryRanges[index - 1].endTokenId, 'Range overlaps with previous range');
    }

    if (index < expiryRanges.length - 1) {
      require(endId < expiryRanges[index + 1].startTokenId, 'Range overlaps with next range');
    }

    expiryRanges[index] = ExpiryRange(startId, endId, expiryTime);
    emit EventExpiryRangeUpdated(index, startId, endId, expiryTime);
  }

  function setUser(uint256 tokenId, address user) public virtual whenNotPaused {
    require(_isApprovedOrOwner(msg.sender, tokenId), 'ERC4907: caller is not owner nor approved');
    require(isBanned(tokenId) == false, 'token is banned');
    uint64 expires = userExpires(tokenId);
    require(expires > block.timestamp, 'token has expired');
    _setUser(tokenId, user, expires);
  }

  function _setUser(uint256 tokenId, address user, uint64 expires) internal {
    UserInfo storage info = _users[tokenId];
    info.user = user;
    info.expires = expires;
    emit UpdateUser(tokenId, user, expires);
  }

  function batchSetUser(uint256[] calldata tokenIds, address[] calldata users) public {
    require(tokenIds.length == users.length, 'array length should be same');
    for (uint256 i = 0; i < tokenIds.length; i++) {
      setUser(tokenIds[i], users[i]);
    }
  }

  function userOf(uint256 tokenId) public view virtual returns (address) {
    if (uint256(_users[tokenId].expires) >= block.timestamp) {
      return _users[tokenId].user;
    } else {
      return address(0);
    }
  }

  function userExpires(uint256 tokenId) public view returns (uint64) {
    for (uint i = 0; i < expiryRanges.length; i++) {
      if (tokenId >= expiryRanges[i].startTokenId && tokenId <= expiryRanges[i].endTokenId) {
        return expiryRanges[i].expiryTime;
      }
    }
    return 0;
  }

  function userReedemable(uint256 tokenId) public view virtual returns (uint256) {
    return _users[tokenId].redeemable;
  }

  /// @dev See {IERC165-supportsInterface}.
  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == type(IERC4907).interfaceId || super.supportsInterface(interfaceId);
  }

  function ban(uint256 tokenId, uint64 endTime) public onlyBanAdmin {
    require(endTime > block.timestamp, 'invalid end time');
    require(_exists(tokenId), 'invalid token id');
    _banRecords[tokenId] = endTime;
    emit EventBanUpdated(ownerOf(tokenId), tokenId, endTime);
  }

  function unBan(uint256 tokenId) public onlyBanAdmin {
    _banRecords[tokenId] = 0;
    emit EventBanUpdated(ownerOf(tokenId), tokenId, 0);
  }

  /**
   * @dev See {ERC721-_beforeTokenTransfer}.
   */
  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 firstTokenId,
    uint256 batchSize
  ) internal virtual override {
    super._beforeTokenTransfer(from, to, firstTokenId, batchSize);
    require(isBanned(firstTokenId) == false, 'token is banned');
    if (from != address(0) && !nftTransferable) {
      _checkWhitelistTransfer(from);
    }

    // If the NFT is being transferred, reset the user to address(0)
    if (from != to && _users[firstTokenId].user != address(0)) {
      uint64 expiryTime = userExpires(firstTokenId);
      _setUser(firstTokenId, address(0), expiryTime);
    }
  }

  function _checkWhitelistTransfer(address fromAddress) internal view {
    require(msg.sender == fromAddress, 'msg.sender != fromAddress');
    require(_transferWhitelist[fromAddress], 'not in transfer whitelist');
    require(
      _whitelistTransferStartTime <= block.timestamp &&
        block.timestamp <= _whitelistTransferEndTime,
      'not in whitelist transfer time range'
    );
  }

  function batchTransfer(
    address[] calldata toArray,
    uint256[] calldata tokenIdArray
  ) public whenNotPaused {
    require(toArray.length == tokenIdArray.length, 'array length should be same');
    for (uint256 i = 0; i < toArray.length; i++) {
      transferFrom(msg.sender, toArray[i], tokenIdArray[i]);
    }
  }

  function updateTransferWhiteList(
    address[] calldata addressList,
    bool inWhitelist
  ) public onlyWhitelistAdmin {
    for (uint256 i = 0; i < addressList.length; i++) {
      _transferWhitelist[addressList[i]] = inWhitelist;
    }
    emit EventTransferWhiteListUpdated(addressList, inWhitelist);
  }

  function updateWhitelistTransferTime(
    uint256 startTime,
    uint256 endTime
  ) public onlyWhitelistAdmin {
    require(
      startTime == 0 || endTime == 0 || endTime > startTime,
      'end time must be greater than start time'
    );
    _whitelistTransferStartTime = startTime;
    _whitelistTransferEndTime = endTime;
    emit EventWhitelistTransferTimeUpdated(startTime, endTime);
  }

  function updateNftTransferable(bool transferable) public onlyOwner {
    nftTransferable = transferable;
    emit EventNftTransferableUpdated(transferable);
  }

  function updateMinterAdmin(address minter) public onlyOwner {
    minterAdminAddress = minter;
    emit EventMinterAdminUpdated(minterAdminAddress);
  }

  function updateWhitelistAdmin(address whitelistAdmin) public onlyOwner {
    whitelistAdminAddress = whitelistAdmin;
    emit EventWhiteListAdminUpdated(whitelistAdminAddress);
  }

  function updateBanAdmin(address banAdmin) public onlyOwner {
    banAdminAddress = banAdmin;
    emit EventBanAdminUpdated(banAdminAddress);
  }

  function updateRewardAdmin(address rewardAdmin) external onlyOwner {
    require(rewardAdmin != address(0), 'Invalid address');
    rewardManager = rewardAdmin;
    emit EventRewardManagerAddressChanged(rewardAdmin);
  }

  function depositRewardTokens(uint256 amount) public onlyOwner {
    require(amount > 0, 'Amount is 0');
    rewardPool += amount;
    _transferToContract(msg.sender, amount);

    emit EventRewardTokensDeposited(amount);
  }

  function takeOutRewardTokens(uint256 amount) external onlyOwner {
    require(amount > 0, 'Amount is 0');
    require(amount <= rewardPool, 'Reward pool is too small');
    unchecked {
      rewardPool -= amount;
    }
    _transferFromContract(msg.sender, amount);
    emit EventRewardTokensWithdrawn(amount);
  }

  function _transferToContract(address from, uint256 amount) internal {
    cxt.safeTransferFrom(from, address(this), amount);
  }

  function _transferFromContract(address to, uint256 amount) internal {
    cxt.safeTransfer(to, amount);
  }

  modifier whenNotPaused() {
    require(_unpaused, 'paused');
    _;
  }

  function pause() external onlyOwner whenNotPaused {
    _unpaused = false;
    emit EventContractPaused(_msgSender());
  }

  function unpause() external onlyOwner {
    require(!_unpaused, 'must be paused');
    _unpaused = true;
    emit EventContractUnpaused(_msgSender());
  }

  function paused() external view returns (bool) {
    return !_unpaused;
  }

  function rewardTokenIds(
    uint256[] calldata ids,
    uint256[] calldata amounts
  ) external onlyRewardManager whenNotPaused {
    require(
      ids.length == amounts.length,
      'Given ids and amounts arrays must be of the same length'
    );
    uint256 totalRewardAmount = 0;

    for (uint256 i = 0; i < amounts.length; i++) {
      totalRewardAmount += amounts[i];
    }

    require(
      rewardPool >= totalRewardAmount,
      'Insufficient funds in reward pool for rewardTokenIds'
    );

    uint256 newRewardPool = rewardPool;
    uint256 amount;
    uint256 tokenId;
    uint256 existingRedeemable;
    address isUser;

    for (uint256 j = 0; j < ids.length; j++) {
      amount = amounts[j];
      tokenId = ids[j];

      UserInfo storage info = _users[tokenId];
      existingRedeemable = info.redeemable;
      isUser = userOf(tokenId);

      if (isUser == address(0)) {
        emit EventRewardsFailedDueNFTExpired(tokenId, amount);
        continue;
      }

      newRewardPool -= amount; // remove rewards from pool
      info.redeemable = existingRedeemable + amount; // new redeemable is past + current amount
    }

    rewardPool = newRewardPool;
    emit EventRewardsDisbursed(ids.length);
  }

  function redeemRewards() external whenNotPaused {
    uint256 totalTokens = balanceOf(msg.sender);
    require(totalTokens > 0, 'No tokens owned');
    uint256[] memory tokenIds = tokenIdsOfOwnerByAmount(msg.sender, totalTokens);

    uint256 totalRedeemable = 0;

    for (uint256 i = 0; i < tokenIds.length; i++) {
      uint256 tokenId = tokenIds[i];
      uint256 redeemable = userReedemable(tokenId);

      if (redeemable > 0) {
        totalRedeemable += redeemable;
      }
    }

    require(
      totalRedeemable >= REWARD_REDEEM_THRESHOLD,
      'Total redeemable amount must be higher than redeem threshold'
    );

    _redeemRewards(msg.sender, totalRedeemable, tokenIds);
  }

  function _redeemRewards(
    address owner,
    uint256 totalRedeemable,
    uint256[] memory tokenIds
  ) internal {
    for (uint256 i = 0; i < tokenIds.length; i++) {
      UserInfo storage info = _users[tokenIds[i]];
      info.redeemable = 0; // Reset redeemable amount for all tokens
    }

    _transferFromContract(owner, totalRedeemable);

    emit EventRewardsRedeemed(owner, totalRedeemable);
  }

  function getMetadata()
    external
    view
    returns (
      address _nftController,
      address _cxt,
      address _minterAdmin,
      address _banAdmin,
      address _whitelistAdmin,
      address _rewardManager,
      uint256 _nextTokenId,
      uint256 _rewardPool,
      bool _nftTransferable,
      string memory _baseUrl,
      ExpiryRange[] memory _expiryRanges
    )
  {
    return (
      address(this),
      address(cxt),
      minterAdminAddress,
      banAdminAddress,
      whitelistAdminAddress,
      rewardManager,
      nextTokenId,
      rewardPool,
      nftTransferable,
      baseUrl,
      expiryRanges
    );
  }

  // Function to get UserInfo for a given tokenId
  function getUserInfo(uint256 tokenId) public view returns (UserInfo memory) {
    return _users[tokenId];
  }

  // Function to get ban end timestamp for a given tokenId
  function getBanRecord(uint256 tokenId) public view returns (uint64) {
    return _banRecords[tokenId];
  }

  function getWhitelistTransferTime() public view returns (uint256 startTime, uint256 endTime) {
    startTime = _whitelistTransferStartTime;
    endTime = _whitelistTransferEndTime;
  }

  function tokenIdsOfOwnerByAmount(
    address user,
    uint256 amount
  ) public view returns (uint256[] memory tokenIds) {
    uint256 total = balanceOf(user);
    require(amount > 0, 'invalid count');
    require(amount <= total, 'invalid count');

    tokenIds = new uint256[](amount);
    for (uint256 i = 0; i < amount; i++) {
      uint256 tokenId = tokenOfOwnerByIndex(user, i);
      tokenIds[i] = tokenId;
    }
  }

  function getBanEndTime(uint256 tokenId) public view returns (uint64) {
    return _banRecords[tokenId];
  }

  function isBanned(uint256 tokenId) public view returns (bool) {
    return _banRecords[tokenId] > block.timestamp;
  }

  function inTransferWhitelist(address addr) public view returns (bool) {
    return _transferWhitelist[addr];
  }
}
