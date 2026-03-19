import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [cards, setCards] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const token = localStorage.getItem('access_token');
    const headers = { 'Authorization': `Bearer ${token}` };
    
    const usersRes = await fetch('/api/admin/users', { headers });
    const cardsRes = await fetch('/api/admin/card-requests', { headers });
    
    setUsers((await usersRes.json()).users || []);
    setCards(await cardsRes.json() || []);
  };

  const approveCard = async (id) => {
    if (!confirm('Approve card?')) return;
    await fetch(`/api/admin/card-requests/${id}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
    });
    fetchData();
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Admin Panel</h1>
      
      <h2>Users</h2>
      <table border="1" cellPadding="10">
        <tr><th>Name</th><th>Email</th><th>KYC</th></tr>
        {users.map(u => (
          <tr key={u.id}>
            <td>{u.full_name}</td>
            <td>{u.email}</td>
            <td>{u.kyc_status}</td>
          </tr>
        ))}
      </table>

      <h2>Card Requests</h2>
      <table border="1" cellPadding="10">
        <tr><th>User</th><th>Card</th><th>Status</th><th>Action</th></tr>
        {cards.map(c => (
          <tr key={c.id}>
            <td>{c.full_name}</td>
            <td>{c.card_network} - {c.card_name}</td>
            <td>{c.status}</td>
            <td>
              {c.status === 'pending' && (
                <button onClick={() => approveCard(c.id)}>Approve</button>
              )}
            </td>
          </tr>
        ))}
      </table>
    </div>
  );
}