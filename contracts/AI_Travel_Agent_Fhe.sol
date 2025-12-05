pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract AITravelAgentFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;
    uint256 public currentBatchId;
    bool public batchOpen;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    // Encrypted travel preferences (example structure)
    struct EncryptedTravelPreferences {
        euint32 maxBudget; // Encrypted max budget for the trip
        euint32 preferredDuration; // Encrypted preferred trip duration in days
        euint32 departureDate; // Encrypted preferred departure date (e.g., YYYYMMDD)
        euint32 destinationType; // Encrypted destination type (e.g., 1=beach, 2=mountain)
    }
    mapping(uint256 => mapping(address => EncryptedTravelPreferences)) public userPreferences;

    // Encrypted results to be decrypted
    struct EncryptedTravelResults {
        euint32 bestPrice; // Encrypted best price found
        euint32 bestDuration; // Encrypted best duration found
        euint32 bestDepartureDate; // Encrypted best departure date found
    }
    mapping(uint256 => EncryptedTravelResults) public batchResults;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event ContractPaused(address indexed account);
    event ContractUnpaused(address indexed account);
    event CooldownSecondsUpdated(uint256 indexed oldCooldown, uint256 indexed newCooldown);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event TravelPreferencesSubmitted(address indexed user, uint256 indexed batchId);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint32 bestPrice, uint32 bestDuration, uint32 bestDepartureDate);

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchClosed();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidProof();
    error NotInitialized();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkSubmissionCooldown() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier checkDecryptionRequestCooldown() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        cooldownSeconds = 60; // Default cooldown of 60 seconds
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        isProvider[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        isProvider[provider] = false;
        emit ProviderRemoved(provider);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        if (_paused) {
            emit ContractPaused(msg.sender);
        } else {
            emit ContractUnpaused(msg.sender);
        }
    }

    function setCooldownSeconds(uint256 newCooldown) external onlyOwner {
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = newCooldown;
        emit CooldownSecondsUpdated(oldCooldown, newCooldown);
    }

    function openBatch() external onlyOwner whenNotPaused {
        currentBatchId++;
        batchOpen = true;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyOwner whenNotPaused {
        batchOpen = false;
        emit BatchClosed(currentBatchId);
    }

    function submitTravelPreferences(
        euint32 maxBudget,
        euint32 preferredDuration,
        euint32 departureDate,
        euint32 destinationType
    ) external whenNotPaused checkSubmissionCooldown {
        if (!batchOpen) revert BatchClosed();

        lastSubmissionTime[msg.sender] = block.timestamp;

        _initIfNeeded(maxBudget);
        _initIfNeeded(preferredDuration);
        _initIfNeeded(departureDate);
        _initIfNeeded(destinationType);

        userPreferences[currentBatchId][msg.sender] = EncryptedTravelPreferences({
            maxBudget: maxBudget,
            preferredDuration: preferredDuration,
            departureDate: departureDate,
            destinationType: destinationType
        });

        emit TravelPreferencesSubmitted(msg.sender, currentBatchId);
    }

    function processBatchAndRequestDecryption(uint256 batchId) external onlyProvider whenNotPaused checkDecryptionRequestCooldown {
        if (batchId != currentBatchId || batchOpen) revert("Batch not ready for processing"); // Ensure batch is closed

        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        // Placeholder for AI processing logic - this would be complex FHE operations
        // For this example, we'll just initialize some dummy encrypted results
        euint32 bestPrice = FHE.asEuint32(0); // Placeholder
        euint32 bestDuration = FHE.asEuint32(0); // Placeholder
        euint32 bestDepartureDate = FHE.asEuint32(0); // Placeholder

        _initIfNeeded(bestPrice);
        _initIfNeeded(bestDuration);
        _initIfNeeded(bestDepartureDate);

        batchResults[batchId] = EncryptedTravelResults({
            bestPrice: bestPrice,
            bestDuration: bestDuration,
            bestDepartureDate: bestDepartureDate
        });

        // 1. Prepare Ciphertexts
        bytes32[] memory cts = new bytes32[](3);
        cts[0] = FHE.toBytes32(batchResults[batchId].bestPrice);
        cts[1] = FHE.toBytes32(batchResults[batchId].bestDuration);
        cts[2] = FHE.toBytes32(batchResults[batchId].bestDepartureDate);

        // 2. Compute State Hash
        bytes32 stateHash = _hashCiphertexts(cts);

        // 3. Request Decryption
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        // 4. Store Context
        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            stateHash: stateHash,
            processed: false
        });

        emit DecryptionRequested(requestId, batchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        // 5a. Replay Guard
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();

        // 5b. State Verification
        // Rebuild cts array in the exact same order as in processBatchAndRequestDecryption
        EncryptedTravelResults storage results = batchResults[decryptionContexts[requestId].batchId];
        bytes32[] memory cts = new bytes32[](3);
        cts[0] = FHE.toBytes32(results.bestPrice);
        cts[1] = FHE.toBytes32(results.bestDuration);
        cts[2] = FHE.toBytes32(results.bestDepartureDate);

        bytes32 currentHash = _hashCiphertexts(cts);
        if (currentHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        // 5c. Proof Verification
        if (!FHE.checkSignatures(requestId, cleartexts, proof)) {
            revert InvalidProof();
        }

        // 5d. Decode & Finalize
        // Decode cleartexts in the same order they were encrypted
        uint256 offset = 0;
        uint32 bestPrice = abi.decode(abi.encodePacked(cleartexts, offset), (uint32)); offset += 4;
        uint32 bestDuration = abi.decode(abi.encodePacked(cleartexts, offset), (uint32)); offset += 4;
        uint32 bestDepartureDate = abi.decode(abi.encodePacked(cleartexts, offset), (uint32)); offset += 4;

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, decryptionContexts[requestId].batchId, bestPrice, bestDuration, bestDepartureDate);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 v) internal {
        if (!FHE.isInitialized(v)) revert NotInitialized();
    }

    function _requireInitialized(euint32 v) internal view {
        if (!FHE.isInitialized(v)) revert NotInitialized();
    }
}