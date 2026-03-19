import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { adminApi } from '../api/client';

// Helper functions
const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0);
const fmtDate = (date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function Spinner({ size = 20, color = '#c8102e' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"
      style={{ animation: 'spin 0.8s linear infinite' }}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  );
}

// Simple Stat Card component
function StatCard({ title, value }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      padding: '20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
    }}>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#012169' }}>{value}</div>
    </div>
  );
}

// Simple Table component
function Table({ headers, data, renderRow }) {
  if (!data || data.length === 0) {
    return (
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: 32,
        textAlign: 'center',
        color: '#aaa',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
      }}>
        No data found
      </div>
    );
  }

  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${headers.length}, 1fr)`,
        background: '#f8f9fb',
        padding: '12px 16px',
        borderBottom: '1px solid #e5e7eb',
        fontWeight: 600,
        fontSize: 12,
        color: '#012169'
      }}>
        {headers.map(h => <div key={h}>{h}</div>)}
      </div>
      <div>
        {data.map((item, i) => (
          <div key={item.id || i} style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${headers.length}, 1fr)`,
            padding: '12px 16px',
            borderBottom: i < data.length - 1 ? '1px solid #f0f0f0' : 'none',
            alignItems: 'center',
            fontSize: 13
          }}>
            {renderRow(item)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboardSimple() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    stats: {},
    users: [],
    cardRequests: [],
    loanApplications: [],
    kycSubmissions: [],
    limitRequests: []
  });
  const [actionLoading, setActionLoading] = useState(false);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'users', label: 'Users', icon: '👥' },
    { id: 'cards', label: 'Card Requests', icon: '💳' },
    { id: 'loans', label: 'Loans', icon: '🏦' },
    { id: 'kyc', label: 'KYC', icon: '🪪' },
    { id: 'limits', label: 'Limit Upgrades', icon: '📈' }
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsData, usersData, cardsData, loansData, kycData, limitsData] = await Promise.all([
        adminApi.getStats().catch(() => ({})),
        adminApi.getAllUsers().catch(() => ({ users: [] })),
        adminApi.getAllCardRequests().catch(() => []),
        adminApi.getAllLoanApplications().catch(() => []),
        adminApi.getAllKycSubmissions().catch(() => []),
        adminApi.getAllLimitRequests().catch(() => [])
      ]);

      setData({
        stats: statsData,
        users: usersData.users || [],
        cardRequests: cardsData || [],
        loanApplications: loansData || [],
        kycSubmissions: kycData || [],
        limitRequests: limitsData || []
      });
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveCard = async (id) => {
    if (!confirm('Approve this card request?')) return;
    setActionLoading(true);
    try {
      await adminApi.approveCardRequest(id);
      await loadData();
      alert('Card approved!');
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeclineCard = async (id) => {
    const reason = prompt('Decline reason:');
    if (!reason) return;
    setActionLoading(true);
    try {
      await adminApi.declineCardRequest(id, reason);
      await loadData();
      alert('Card declined');
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveKyc = async (id) => {
    if (!confirm('Approve KYC?')) return;
    setActionLoading(true);
    try {
      await adminApi.approveKyc(id);
      await loadData();
      alert('KYC approved');
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveLoan = async (id) => {
    if (!confirm('Approve loan?')) return;
    setActionLoading(true);
    try {
      await adminApi.approveLoan(id);
      await loadData();
      alert('Loan approved');
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8f9fb'
      }}>
        <Spinner size={48} color="#012169" />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8f9fb',
      fontFamily: "'DM Sans', sans-serif"
    }}>
      {/* Header */}
      <div style={{
        background: '#012169',
        padding: '16px 30px',
        color: '#fff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: '#c8102e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            fontWeight: 800
          }}>A</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>NexaBank Admin</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{user?.email}</div>
          </div>
        </div>
        <button
          onClick={logout}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13
          }}
        >
          Logout
        </button>
      </div>

      {/* Tab Navigation */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
        padding: '0 30px',
        display: 'flex',
        gap: 20
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '16px 4px',
              border: 'none',
              borderBottom: activeTab === tab.id ? '3px solid #c8102e' : '3px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? '#012169' : '#888',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <span>{tab.icon}</span>
            {tab.label}
            {tab.id === 'cards' && data.cardRequests.filter(r => r.status === 'pending').length > 0 && (
              <span style={{
                background: '#c8102e',
                color: '#fff',
                fontSize: 11,
                padding: '2px 6px',
                borderRadius: 10
              }}>{data.cardRequests.filter(r => r.status === 'pending').length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div style={{ padding: 30 }}>
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div>
            <h2 style={{ fontSize: 20, color: '#012169', marginBottom: 20 }}>Dashboard Overview</h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 20,
              marginBottom: 30
            }}>
              <StatCard title="Total Users" value={data.stats.total_users || 0} />
              <StatCard title="Pending Cards" value={data.cardRequests.filter(r => r.status === 'pending').length} />
              <StatCard title="Pending KYC" value={data.kycSubmissions.filter(r => r.status === 'pending').length} />
              <StatCard title="Pending Loans" value={data.loanApplications.filter(r => ['pending','under_review'].includes(r.status)).length} />
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div>
            <h2 style={{ fontSize: 20, color: '#012169', marginBottom: 20 }}>User Management</h2>
            <Table
              headers={['Name', 'Email', 'Tier', 'KYC', 'Status']}
              data={data.users}
              renderRow={(user) => (
                <>
                  <div style={{ fontWeight: 600 }}>{user.full_name}</div>
                  <div>{user.email}</div>
                  <div>Tier {user.tier || 1}</div>
                  <div>
                    <span style={{
                      padding: '4px 8px',
                      background: user.kyc_status === 'verified' ? '#d1fae5' : '#fef3c7',
                      color: user.kyc_status === 'verified' ? '#065f46' : '#b45309',
                      borderRadius: 12,
                      fontSize: 11
                    }}>
                      {user.kyc_status || 'pending'}
                    </span>
                  </div>
                  <div>
                    <span style={{
                      padding: '4px 8px',
                      background: user.is_active ? '#d1fae5' : '#fee2e2',
                      color: user.is_active ? '#065f46' : '#991b1b',
                      borderRadius: 12,
                      fontSize: 11
                    }}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </>
              )}
            />
          </div>
        )}

        {/* Card Requests Tab */}
        {activeTab === 'cards' && (
          <div>
            <h2 style={{ fontSize: 20, color: '#012169', marginBottom: 20 }}>Card Requests</h2>
            <Table
              headers={['User', 'Card', 'Name', 'Date', 'Status', 'Actions']}
              data={data.cardRequests}
              renderRow={(req) => (
                <>
                  <div>
                    <div style={{ fontWeight: 600 }}>{req.full_name}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{req.email}</div>
                  </div>
                  <div style={{ textTransform: 'uppercase' }}>{req.card_network}</div>
                  <div>{req.card_name}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{fmtDate(req.created_at)}</div>
                  <div>
                    <span style={{
                      padding: '4px 8px',
                      background: req.status === 'pending' ? '#fef3c7' : req.status === 'approved' ? '#d1fae5' : '#fee2e2',
                      color: req.status === 'pending' ? '#b45309' : req.status === 'approved' ? '#065f46' : '#991b1b',
                      borderRadius: 12,
                      fontSize: 11
                    }}>
                      {req.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {req.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApproveCard(req.id)}
                          disabled={actionLoading}
                          style={{
                            padding: '6px 12px',
                            border: 'none',
                            borderRadius: 6,
                            background: '#1a7f4b',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: 12
                          }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleDeclineCard(req.id)}
                          disabled={actionLoading}
                          style={{
                            padding: '6px 12px',
                            border: '1px solid #e5e7eb',
                            borderRadius: 6,
                            background: '#fff',
                            color: '#c8102e',
                            cursor: 'pointer',
                            fontSize: 12
                          }}
                        >
                          Decline
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            />
          </div>
        )}

        {/* KYC Tab */}
        {activeTab === 'kyc' && (
          <div>
            <h2 style={{ fontSize: 20, color: '#012169', marginBottom: 20 }}>KYC Verifications</h2>
            <Table
              headers={['User', 'SSN', 'Submitted', 'Status', 'Actions']}
              data={data.kycSubmissions}
              renderRow={(kyc) => (
                <>
                  <div>
                    <div style={{ fontWeight: 600 }}>{kyc.full_name}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{kyc.email}</div>
                  </div>
                  <div>•••-••-{kyc.ssn?.slice(-4) || '—'}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{fmtDate(kyc.submitted_at)}</div>
                  <div>
                    <span style={{
                      padding: '4px 8px',
                      background: kyc.status === 'pending' ? '#fef3c7' : kyc.status === 'verified' ? '#d1fae5' : '#fee2e2',
                      color: kyc.status === 'pending' ? '#b45309' : kyc.status === 'verified' ? '#065f46' : '#991b1b',
                      borderRadius: 12,
                      fontSize: 11
                    }}>
                      {kyc.status}
                    </span>
                  </div>
                  <div>
                    {kyc.status === 'pending' && (
                      <button
                        onClick={() => handleApproveKyc(kyc.id)}
                        disabled={actionLoading}
                        style={{
                          padding: '6px 12px',
                          border: 'none',
                          borderRadius: 6,
                          background: '#1a7f4b',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: 12
                        }}
                      >
                        Verify
                      </button>
                    )}
                  </div>
                </>
              )}
            />
          </div>
        )}

        {/* Loans Tab */}
        {activeTab === 'loans' && (
          <div>
            <h2 style={{ fontSize: 20, color: '#012169', marginBottom: 20 }}>Loan Applications</h2>
            <Table
              headers={['User', 'Type', 'Amount', 'Status', 'Actions']}
              data={data.loanApplications}
              renderRow={(loan) => (
                <>
                  <div>
                    <div style={{ fontWeight: 600 }}>{loan.full_name}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{loan.email}</div>
                  </div>
                  <div style={{ textTransform: 'capitalize' }}>{loan.loan_type}</div>
                  <div style={{ fontWeight: 600 }}>{fmt(loan.amount)}</div>
                  <div>
                    <span style={{
                      padding: '4px 8px',
                      background: loan.status === 'pending' ? '#fef3c7' : loan.status === 'approved' ? '#d1fae5' : '#fee2e2',
                      color: loan.status === 'pending' ? '#b45309' : loan.status === 'approved' ? '#065f46' : '#991b1b',
                      borderRadius: 12,
                      fontSize: 11
                    }}>
                      {loan.status}
                    </span>
                  </div>
                  <div>
                    {loan.status === 'pending' && (
                      <button
                        onClick={() => handleApproveLoan(loan.id)}
                        disabled={actionLoading}
                        style={{
                          padding: '6px 12px',
                          border: 'none',
                          borderRadius: 6,
                          background: '#1a7f4b',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: 12
                        }}
                      >
                        Approve
                      </button>
                    )}
                  </div>
                </>
              )}
            />
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}