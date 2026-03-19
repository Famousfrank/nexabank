import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [cards, setCards] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);

  // List of admin emails (temporary until you add is_admin to database)
  const adminEmails = ['admin@nexabank.com', 'franknkem0049@gmail.com'];

  useEffect(() => {
    // Check if user is admin by email
    if (!user || !adminEmails.includes(user.email)) {
      window.location.href = '/admin';
      return;
    }
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    const token = localStorage.getItem('access_token');
    const headers = { 'Authorization': `Bearer ${token}` };
    
    try {
      const [usersRes, cardsRes, loansRes] = await Promise.all([
        fetch('/api/admin/users', { headers }),
        fetch('/api/admin/card-requests', { headers }),
        fetch('/api/admin/loans', { headers })
      ]);

      const usersData = await usersRes.json();
      const cardsData = await cardsRes.json();
      const loansData = await loansRes.json();

      setUsers(usersData.users || []);
      setCards(cardsData || []);
      setLoans(loansData || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const approveCard = async (id) => {
    if (!confirm('Approve this card request?')) return;
    await fetch(`/api/admin/card-requests/${id}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
    });
    loadData();
  };

  const approveLoan = async (id) => {
    if (!confirm('Approve this loan application?')) return;
    await fetch(`/api/admin/loans/${id}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
    });
    loadData();
  };

  const declineLoan = async (id) => {
    const reason = prompt('Reason for declining:');
    if (!reason) return;
    
    await fetch(`/api/admin/loans/${id}/decline`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason })
    });
    loadData();
  };

  if (!user) return null;
  
  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;

  return (
    <div>
      <div style={{ background: '#012169', color: '#fff', padding: '15px 20px', display: 'flex', justifyContent: 'space-between' }}>
        <h2>Admin Dashboard</h2>
        <button onClick={logout} style={{ background: '#c8102e', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: 5, cursor: 'pointer' }}>
          Logout
        </button>
      </div>

      <div style={{ padding: 20 }}>
        {/* Stats */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 30 }}>
          <div style={{ background: '#f0f0f0', padding: 15, borderRadius: 5, flex: 1 }}>
            <h3>Total Users</h3>
            <p style={{ fontSize: 24, fontWeight: 'bold' }}>{users.length}</p>
          </div>
          <div style={{ background: '#f0f0f0', padding: 15, borderRadius: 5, flex: 1 }}>
            <h3>Pending Cards</h3>
            <p style={{ fontSize: 24, fontWeight: 'bold' }}>{cards.filter(c => c.status === 'pending').length}</p>
          </div>
          <div style={{ background: '#f0f0f0', padding: 15, borderRadius: 5, flex: 1 }}>
            <h3>Pending Loans</h3>
            <p style={{ fontSize: 24, fontWeight: 'bold' }}>{loans.filter(l => l.status === 'pending').length}</p>
          </div>
        </div>

        {/* Users Section */}
        <h3>Users ({users.length})</h3>
        <table border="1" cellPadding="8" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 30 }}>
          <thead style={{ background: '#f5f5f5' }}>
            <tr>
              <th>Name</th><th>Email</th><th>Phone</th><th>KYC</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.full_name}</td>
                <td>{u.email}</td>
                <td>{u.phone}</td>
                <td>{u.kyc_status}</td>
                <td>{u.is_active ? 'Active' : 'Inactive'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Card Requests Section */}
        <h3>Card Requests ({cards.length})</h3>
        <table border="1" cellPadding="8" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 30 }}>
          <thead style={{ background: '#f5f5f5' }}>
            <tr>
              <th>User</th><th>Card</th><th>Name</th><th>Status</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {cards.map(c => (
              <tr key={c.id}>
                <td>{c.full_name}</td>
                <td>{c.card_network}</td>
                <td>{c.card_name}</td>
                <td>{c.status}</td>
                <td>
                  {c.status === 'pending' && (
                    <button onClick={() => approveCard(c.id)} style={{ background: '#28a745', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 3, cursor: 'pointer' }}>
                      Approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Loan Applications Section */}
        <h3>Loan Applications ({loans.length})</h3>
        {loans.length === 0 ? (
          <p>No loan applications found.</p>
        ) : (
          <table border="1" cellPadding="8" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f5f5f5' }}>
              <tr>
                <th>User</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Term</th>
                <th>Income</th>
                <th>Credit Score</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loans.map(loan => (
                <tr key={loan.id}>
                  <td>
                    <div>{loan.full_name}</div>
                    <small>{loan.email}</small>
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{loan.loan_type}</td>
                  <td>${Number(loan.amount).toLocaleString()}</td>
                  <td>{loan.term_months} months</td>
                  <td>${Number(loan.annual_income).toLocaleString()}</td>
                  <td>{loan.credit_score_range}</td>
                  <td>
                    <span style={{ 
                      padding: '3px 8px',
                      borderRadius: 3,
                      fontSize: 12,
                      background: loan.status === 'approved' ? '#d4edda' : 
                                 loan.status === 'pending' ? '#fff3cd' : 
                                 loan.status === 'under_review' ? '#cce5ff' : 
                                 '#f8d7da',
                      color: loan.status === 'approved' ? '#155724' : 
                             loan.status === 'pending' ? '#856404' : 
                             loan.status === 'under_review' ? '#004085' : 
                             '#721c24'
                    }}>
                      {loan.status}
                    </span>
                  </td>
                  <td>
                    {loan.status === 'pending' && (
                      <>
                        <button 
                          onClick={() => approveLoan(loan.id)}
                          style={{ 
                            background: '#28a745', 
                            color: '#fff', 
                            border: 'none', 
                            padding: '5px 10px', 
                            borderRadius: 3, 
                            cursor: 'pointer',
                            marginRight: 5
                          }}
                        >
                          Approve
                        </button>
                        <button 
                          onClick={() => declineLoan(loan.id)}
                          style={{ 
                            background: '#dc3545', 
                            color: '#fff', 
                            border: 'none', 
                            padding: '5px 10px', 
                            borderRadius: 3, 
                            cursor: 'pointer' 
                          }}
                        >
                          Decline
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}