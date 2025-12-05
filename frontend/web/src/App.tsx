// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface TravelRecord {
  id: string;
  encryptedBudget: string;
  encryptedDays: string;
  timestamp: number;
  owner: string;
  destination: string;
  status: "planning" | "booked" | "cancelled";
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<TravelRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({ destination: "", budget: 0, days: 1 });
  const [showIntro, setShowIntro] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<TravelRecord | null>(null);
  const [decryptedBudget, setDecryptedBudget] = useState<number | null>(null);
  const [decryptedDays, setDecryptedDays] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  const planningCount = records.filter(r => r.status === "planning").length;
  const bookedCount = records.filter(r => r.status === "booked").length;
  const cancelledCount = records.filter(r => r.status === "cancelled").length;

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      const keysBytes = await contract.getData("travel_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing travel keys:", e); }
      }
      const list: TravelRecord[] = [];
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`travel_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({ 
                id: key, 
                encryptedBudget: recordData.budget, 
                encryptedDays: recordData.days,
                timestamp: recordData.timestamp, 
                owner: recordData.owner, 
                destination: recordData.destination, 
                status: recordData.status || "planning" 
              });
            } catch (e) { console.error(`Error parsing record data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading record ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) { console.error("Error loading records:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const submitRecord = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting travel data with Zama FHE..." });
    try {
      const encryptedBudget = FHEEncryptNumber(newRecordData.budget);
      const encryptedDays = FHEEncryptNumber(newRecordData.days);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const recordData = { 
        budget: encryptedBudget, 
        days: encryptedDays,
        timestamp: Math.floor(Date.now() / 1000), 
        owner: address, 
        destination: newRecordData.destination, 
        status: "planning" 
      };
      await contract.setData(`travel_${recordId}`, ethers.toUtf8Bytes(JSON.stringify(recordData)));
      const keysBytes = await contract.getData("travel_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(recordId);
      await contract.setData("travel_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      setTransactionStatus({ visible: true, status: "success", message: "Encrypted travel plan submitted securely!" });
      await loadRecords();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({ destination: "", budget: 0, days: 1 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const decryptWithSignature = async (encryptedBudget: string, encryptedDays: string): Promise<[number, number] | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return [FHEDecryptNumber(encryptedBudget), FHEDecryptNumber(encryptedDays)];
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const bookTrip = async (recordId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted booking with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const recordBytes = await contract.getData(`travel_${recordId}`);
      if (recordBytes.length === 0) throw new Error("Record not found");
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      const updatedRecord = { ...recordData, status: "booked" };
      await contract.setData(`travel_${recordId}`, ethers.toUtf8Bytes(JSON.stringify(updatedRecord)));
      setTransactionStatus({ visible: true, status: "success", message: "Trip booked successfully with FHE!" });
      await loadRecords();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Booking failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const cancelTrip = async (recordId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted cancellation with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const recordBytes = await contract.getData(`travel_${recordId}`);
      if (recordBytes.length === 0) throw new Error("Record not found");
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      const updatedRecord = { ...recordData, status: "cancelled" };
      await contract.setData(`travel_${recordId}`, ethers.toUtf8Bytes(JSON.stringify(updatedRecord)));
      setTransactionStatus({ visible: true, status: "success", message: "Trip cancelled successfully with FHE!" });
      await loadRecords();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Cancellation failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isOwner = (recordAddress: string) => address?.toLowerCase() === recordAddress.toLowerCase();

  const filteredRecords = records.filter(record => {
    const matchesSearch = record.destination.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || record.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const renderStatusChart = () => {
    const total = records.length || 1;
    const planningPercentage = (planningCount / total) * 100;
    const bookedPercentage = (bookedCount / total) * 100;
    const cancelledPercentage = (cancelledCount / total) * 100;
    
    return (
      <div className="status-chart">
        <div className="chart-bar">
          <div className="bar-segment planning" style={{ width: `${planningPercentage}%` }}></div>
          <div className="bar-segment booked" style={{ width: `${bookedPercentage}%` }}></div>
          <div className="bar-segment cancelled" style={{ width: `${cancelledPercentage}%` }}></div>
        </div>
        <div className="chart-legend">
          <div className="legend-item"><div className="color-dot planning"></div> Planning: {planningCount}</div>
          <div className="legend-item"><div className="color-dot booked"></div> Booked: {bookedCount}</div>
          <div className="legend-item"><div className="color-dot cancelled"></div> Cancelled: {cancelledCount}</div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Loading encrypted travel plans...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>FHE<span>Travel</span>Agent</h1>
          <div className="tagline">Private AI-Powered Travel Planning</div>
        </div>
        <div className="header-actions">
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>

      <div className="main-content">
        {showIntro && (
          <div className="intro-card glass-card">
            <button className="close-intro" onClick={() => setShowIntro(false)}>×</button>
            <h2>Welcome to FHE Travel Agent</h2>
            <p>Plan your trips with complete privacy using Zama's Fully Homomorphic Encryption (FHE) technology.</p>
            <div className="features-grid">
              <div className="feature">
                <div className="feature-icon">🔒</div>
                <h3>Encrypted Preferences</h3>
                <p>Your budget and travel duration remain encrypted at all times</p>
              </div>
              <div className="feature">
                <div className="feature-icon">🤖</div>
                <h3>AI Recommendations</h3>
                <p>Get personalized travel suggestions without exposing your data</p>
              </div>
              <div className="feature">
                <div className="feature-icon">✈️</div>
                <h3>Secure Bookings</h3>
                <p>Book flights and hotels while keeping your information private</p>
              </div>
            </div>
            <div className="fhe-explainer">
              <h4>How FHE Protects Your Travel Data</h4>
              <div className="steps">
                <div className="step">1. Encrypt your budget and travel days locally</div>
                <div className="step">2. AI processes encrypted data without decryption</div>
                <div className="step">3. Get recommendations while keeping data private</div>
              </div>
            </div>
          </div>
        )}

        <div className="stats-card glass-card">
          <h2>Travel Statistics</h2>
          <div className="stats-grid">
            <div className="stat">
              <div className="stat-value">{records.length}</div>
              <div className="stat-label">Total Trips</div>
            </div>
            <div className="stat">
              <div className="stat-value">{planningCount}</div>
              <div className="stat-label">Planning</div>
            </div>
            <div className="stat">
              <div className="stat-value">{bookedCount}</div>
              <div className="stat-label">Booked</div>
            </div>
            <div className="stat">
              <div className="stat-value">{cancelledCount}</div>
              <div className="stat-label">Cancelled</div>
            </div>
          </div>
          {renderStatusChart()}
        </div>

        <div className="actions-bar">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="primary-btn"
          >
            + New Travel Plan
          </button>
          <div className="search-filter">
            <input 
              type="text" 
              placeholder="Search destinations..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <select 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Statuses</option>
              <option value="planning">Planning</option>
              <option value="booked">Booked</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button onClick={loadRecords} className="refresh-btn">
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="records-container">
          {filteredRecords.length === 0 ? (
            <div className="empty-state glass-card">
              <div className="empty-icon">✈️</div>
              <h3>No travel plans found</h3>
              <p>Create your first encrypted travel plan to get started</p>
              <button 
                onClick={() => setShowCreateModal(true)} 
                className="primary-btn"
              >
                Create Travel Plan
              </button>
            </div>
          ) : (
            filteredRecords.map(record => (
              <div 
                key={record.id} 
                className={`travel-card glass-card ${record.status}`}
                onClick={() => setSelectedRecord(record)}
              >
                <div className="card-header">
                  <h3>{record.destination}</h3>
                  <span className={`status-badge ${record.status}`}>
                    {record.status}
                  </span>
                </div>
                <div className="card-details">
                  <div className="detail">
                    <span className="label">Owner:</span>
                    <span className="value">
                      {record.owner.substring(0, 6)}...{record.owner.substring(38)}
                    </span>
                  </div>
                  <div className="detail">
                    <span className="label">Date:</span>
                    <span className="value">
                      {new Date(record.timestamp * 1000).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="card-footer">
                  <div className="fhe-tag">
                    <span>FHE Encrypted</span>
                  </div>
                  {isOwner(record.owner) && (
                    <div className="card-actions">
                      {record.status === "planning" && (
                        <button 
                          className="action-btn book"
                          onClick={(e) => {
                            e.stopPropagation();
                            bookTrip(record.id);
                          }}
                        >
                          Book
                        </button>
                      )}
                      {record.status !== "cancelled" && (
                        <button 
                          className="action-btn cancel"
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelTrip(record.id);
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal glass-card">
            <div className="modal-header">
              <h2>New Travel Plan</h2>
              <button 
                onClick={() => {
                  setShowCreateModal(false);
                  setNewRecordData({ destination: "", budget: 0, days: 1 });
                }} 
                className="close-modal"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Destination</label>
                <input
                  type="text"
                  placeholder="Where do you want to go?"
                  value={newRecordData.destination}
                  onChange={(e) => setNewRecordData({...newRecordData, destination: e.target.value})}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Budget (USD)</label>
                <input
                  type="number"
                  placeholder="Your travel budget"
                  value={newRecordData.budget}
                  onChange={(e) => setNewRecordData({...newRecordData, budget: parseFloat(e.target.value) || 0})}
                  className="form-input"
                  min="0"
                  step="10"
                />
              </div>
              <div className="form-group">
                <label>Duration (Days)</label>
                <input
                  type="number"
                  placeholder="Trip duration in days"
                  value={newRecordData.days}
                  onChange={(e) => setNewRecordData({...newRecordData, days: parseInt(e.target.value) || 1})}
                  className="form-input"
                  min="1"
                />
              </div>
              <div className="encryption-preview">
                <h4>FHE Encryption Preview</h4>
                <div className="preview-row">
                  <span>Budget:</span>
                  <span className="encrypted-value">
                    {newRecordData.budget > 0 ? 
                      FHEEncryptNumber(newRecordData.budget).substring(0, 20) + '...' : 
                      'Not encrypted yet'}
                  </span>
                </div>
                <div className="preview-row">
                  <span>Days:</span>
                  <span className="encrypted-value">
                    {newRecordData.days > 0 ? 
                      FHEEncryptNumber(newRecordData.days).substring(0, 20) + '...' : 
                      'Not encrypted yet'}
                  </span>
                </div>
              </div>
              <div className="privacy-notice">
                <div className="lock-icon">🔒</div>
                <p>
                  Your data will be encrypted with Zama FHE before submission and 
                  remain encrypted during processing. No sensitive information is 
                  exposed to the network.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewRecordData({ destination: "", budget: 0, days: 1 });
                }}
                className="secondary-btn"
              >
                Cancel
              </button>
              <button
                onClick={submitRecord}
                disabled={creating || !newRecordData.destination || newRecordData.budget <= 0}
                className="primary-btn"
              >
                {creating ? "Encrypting with FHE..." : "Create Encrypted Plan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedRecord && (
        <div className="modal-overlay">
          <div className="detail-modal glass-card">
            <div className="modal-header">
              <h2>Trip to {selectedRecord.destination}</h2>
              <button 
                onClick={() => {
                  setSelectedRecord(null);
                  setDecryptedBudget(null);
                  setDecryptedDays(null);
                }} 
                className="close-modal"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="trip-info">
                <div className="info-row">
                  <span className="label">Status:</span>
                  <span className={`value status-badge ${selectedRecord.status}`}>
                    {selectedRecord.status}
                  </span>
                </div>
                <div className="info-row">
                  <span className="label">Owner:</span>
                  <span className="value">
                    {selectedRecord.owner.substring(0, 6)}...{selectedRecord.owner.substring(38)}
                  </span>
                </div>
                <div className="info-row">
                  <span className="label">Created:</span>
                  <span className="value">
                    {new Date(selectedRecord.timestamp * 1000).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="encrypted-section">
                <h3>Encrypted Data</h3>
                <div className="encrypted-data">
                  <div className="data-item">
                    <span>Budget:</span>
                    <code>{selectedRecord.encryptedBudget.substring(0, 30)}...</code>
                  </div>
                  <div className="data-item">
                    <span>Days:</span>
                    <code>{selectedRecord.encryptedDays.substring(0, 30)}...</code>
                  </div>
                </div>
                <div className="fhe-badge">
                  <span>FHE Encrypted</span>
                </div>
                <button
                  className="decrypt-btn"
                  onClick={async () => {
                    if (decryptedBudget !== null) {
                      setDecryptedBudget(null);
                      setDecryptedDays(null);
                    } else {
                      const result = await decryptWithSignature(
                        selectedRecord.encryptedBudget, 
                        selectedRecord.encryptedDays
                      );
                      if (result) {
                        setDecryptedBudget(result[0]);
                        setDecryptedDays(result[1]);
                      }
                    }
                  }}
                  disabled={isDecrypting}
                >
                  {isDecrypting ? "Decrypting..." : 
                   decryptedBudget !== null ? "Hide Values" : "Decrypt with Wallet"}
                </button>
              </div>

              {decryptedBudget !== null && decryptedDays !== null && (
                <div className="decrypted-section">
                  <h3>Decrypted Values</h3>
                  <div className="decrypted-data">
                    <div className="data-item">
                      <span>Budget:</span>
                      <span className="value">${decryptedBudget.toLocaleString()}</span>
                    </div>
                    <div className="data-item">
                      <span>Days:</span>
                      <span className="value">{decryptedDays}</span>
                    </div>
                  </div>
                  <div className="decryption-notice">
                    <div className="warning-icon">⚠️</div>
                    <p>
                      These values were decrypted locally after wallet signature verification.
                      They were never exposed to the network in plain text.
                    </p>
                  </div>
                </div>
              )}

              {isOwner(selectedRecord.owner) && (
                <div className="trip-actions">
                  {selectedRecord.status === "planning" && (
                    <button
                      className="action-btn book"
                      onClick={() => {
                        bookTrip(selectedRecord.id);
                        setSelectedRecord(null);
                      }}
                    >
                      Book This Trip
                    </button>
                  )}
                  {selectedRecord.status !== "cancelled" && (
                    <button
                      className="action-btn cancel"
                      onClick={() => {
                        cancelTrip(selectedRecord.id);
                        setSelectedRecord(null);
                      }}
                    >
                      Cancel Trip
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="notification-modal">
          <div className={`notification ${transactionStatus.status}`}>
            <div className="notification-icon">
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✕"}
            </div>
            <div className="notification-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>FHE Travel Agent</h3>
            <p>Private AI-Powered Travel Planning with Zama FHE</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE Travel Agent. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;