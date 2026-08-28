import React, { useState } from 'react';
import { Api } from '../services/api';

export const Auth: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
    const [username, setUsername] = useState('admin');
    const [password, setPassword] = useState('admin');
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await Api.login(username, password);
            localStorage.setItem('auth_token', res.data.token);
            onLogin();
        } catch (err: any) {
            setError('Login failed. Check credentials.');
        }
    };

    return (
        <div style={{ maxWidth: '300px', margin: '100px auto', fontFamily: 'sans-serif' }}>
            <h2>TaskForge Login</h2>
            {error && <div style={{ color: 'red', marginBottom: '10px' }}>{error}</div>}
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input 
                    type="text" 
                    value={username} 
                    onChange={e => setUsername(e.target.value)} 
                    placeholder="Username" 
                />
                <input 
                    type="password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    placeholder="Password" 
                />
                <button type="submit">Login</button>
            </form>
        </div>
    );
};
