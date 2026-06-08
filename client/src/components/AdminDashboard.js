import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Users, MessageSquare, Star, Loader2 } from 'lucide-react';

const AdminDashboard = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

    useEffect(() => {
        const fetchDashboard = async () => {
            const token = localStorage.getItem('adminToken');
            if (!token) return navigate('/admin/login');

            try {
                const res = await axios.get(`${API_URL}/api/admin/dashboard`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setStats(res.data.data);
            } catch (err) {
                console.error("Session expired or invalid token");
                localStorage.removeItem('adminToken');
                navigate('/admin/login');
            } finally {
                setLoading(false);
            }
        };

        fetchDashboard();
    }, [navigate, API_URL]);

    const handleLogout = () => {
        localStorage.removeItem('adminToken');
        navigate('/admin/login');
    };

    if (loading) return (
        <div className="h-screen flex items-center justify-center bg-gray-50">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Sidebar */}
            <div className="w-64 bg-white border-r border-gray-200 flex flex-col p-6">
                <div className="flex items-center gap-2 mb-10 text-blue-600 font-bold text-xl">
                    <LayoutDashboard /> <span>Admin Panel</span>
                </div>
                
                <button 
                    onClick={handleLogout}
                    className="mt-auto flex items-center gap-2 text-red-500 hover:bg-red-50 p-3 rounded-lg transition-colors font-medium"
                >
                    <LogOut className="w-5 h-5" /> Logout
                </button>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-10">
                <header className="mb-10">
                    <h1 className="text-3xl font-bold text-gray-800">Welcome, Admin</h1>
                    <p className="text-gray-500">Real-time stats for Connect It</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <StatCard icon={<Users className="text-blue-600" />} label="Total Users" value={stats?.totalUsers} />
                    <StatCard icon={<MessageSquare className="text-green-600" />} label="Active Chats" value={stats?.activeChats} />
                    <StatCard icon={<Star className="text-amber-600" />} label="New Feedbacks" value={stats?.unreadFeedbacks} />
                </div>
                
                <div className="mt-10 bg-white p-8 rounded-2xl border border-gray-200 shadow-sm text-center">
                    <p className="text-gray-400">Database charts and feedback management will appear here.</p>
                </div>
            </div>
        </div>
    );
};

const StatCard = ({ icon, label, value }) => (
    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
        <div className="bg-gray-50 w-12 h-12 rounded-xl flex items-center justify-center">{icon}</div>
        <div>
            <p className="text-gray-500 text-sm font-medium">{label}</p>
            <p className="text-2xl font-bold text-gray-800">{value}</p>
        </div>
    </div>
);

export default AdminDashboard;