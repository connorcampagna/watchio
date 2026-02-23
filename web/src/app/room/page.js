'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import NeonSign from '@/components/NeonSign';
import RetroButton from '@/components/RetroButton';
import Starfield from '@/components/Starfield';
import { supabase } from '@/lib/supabase';

export default function RoomPage() {
    return (
        <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0d0d0d' }} />}>
            <RoomPageInner />
        </Suspense>
    );
}

function RoomPageInner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const isJoinMode = searchParams.get('join') === 'true';
    const [mode, setMode] = useState(isJoinMode ? 'join' : 'create');

    // Create room state
    const [roomName, setRoomName] = useState('');
    const [videoUrl, setVideoUrl] = useState('');

    // Join room state
    const [inviteCode, setInviteCode] = useState('');

    // Result state
    const [room, setRoom] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

    async function handleCreate(e) {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${SERVER_URL}/api/rooms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: roomName || 'Friday Night Double Feature',
                    hostId: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }),
                    videoUrl,
                }),
            });

            if (!res.ok) throw new Error('Failed to create room');
            const data = await res.json();
            setRoom(data);
            // Redirect to cinema view
            router.push(`/room/${data.id}?host=true`);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleJoin(e) {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${SERVER_URL}/api/rooms/invite/${inviteCode}`);
            if (!res.ok) throw new Error('Room not found');
            const data = await res.json();
            setRoom(data);
            // Redirect to cinema view
            router.push(`/room/${data.id}`);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    function copyInviteCode() {
        if (room?.invite_code) {
            navigator.clipboard.writeText(room.invite_code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }

    return (
        <main
            style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative',
                padding: '2rem',
            }}
        >
            <Starfield count={60} />

            <section
                style={{
                    position: 'relative',
                    zIndex: 1,
                    width: '100%',
                    maxWidth: '520px',
                    paddingTop: '3rem',
                }}
            >
                <NeonSign
                    text="The Box Office"
                    subtitle={mode === 'create' ? '★  Create a Screening  ★' : '★  Join a Screening  ★'}
                />

                {/* Mode Toggle */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        margin: '2rem 0',
                    }}
                >
                    {['create', 'join'].map((m) => (
                        <button
                            key={m}
                            onClick={() => { setMode(m); setRoom(null); setError(''); }}
                            style={{
                                padding: '0.6rem 1.5rem',
                                fontFamily: 'var(--font-body)',
                                fontSize: '0.9rem',
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em',
                                color: mode === m ? 'var(--color-asphalt)' : 'var(--color-cream)',
                                background: mode === m
                                    ? 'var(--color-neon-yellow)'
                                    : 'var(--color-asphalt-mid)',
                                border: mode === m
                                    ? '2px solid var(--color-neon-yellow)'
                                    : '2px solid var(--color-chrome-dark)',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: mode === m
                                    ? '0 0 16px rgba(255,225,77,0.4)'
                                    : 'none',
                            }}
                        >
                            {m === 'create' ? '🎬 Create' : '🎟️ Join'}
                        </button>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    {!room ? (
                        <motion.div
                            key={mode}
                            className="glass-panel"
                            style={{ padding: '2rem' }}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            {mode === 'create' ? (
                                <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    <div>
                                        <label
                                            style={{
                                                fontFamily: 'var(--font-body)',
                                                fontSize: '0.85rem',
                                                color: 'var(--color-neon-yellow)',
                                                display: 'block',
                                                marginBottom: '0.4rem',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.1em',
                                            }}
                                        >
                                            Room Name
                                        </label>
                                        <input
                                            className="retro-input"
                                            placeholder="Friday Night Double Feature"
                                            value={roomName}
                                            onChange={(e) => setRoomName(e.target.value)}
                                        />
                                    </div>

                                    <div>
                                        <label
                                            style={{
                                                fontFamily: 'var(--font-body)',
                                                fontSize: '0.85rem',
                                                color: 'var(--color-neon-yellow)',
                                                display: 'block',
                                                marginBottom: '0.4rem',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.1em',
                                            }}
                                        >
                                            Video URL (optional)
                                        </label>
                                        <input
                                            className="retro-input"
                                            placeholder="https://www.netflix.com/watch/..."
                                            value={videoUrl}
                                            onChange={(e) => setVideoUrl(e.target.value)}
                                        />
                                    </div>

                                    <RetroButton variant="red" type="submit" style={{ width: '100%' }}>
                                        {loading ? '⏳ Creating...' : '🎬 Open Screening'}
                                    </RetroButton>
                                </form>
                            ) : (
                                <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    <div>
                                        <label
                                            style={{
                                                fontFamily: 'var(--font-body)',
                                                fontSize: '0.85rem',
                                                color: 'var(--color-neon-yellow)',
                                                display: 'block',
                                                marginBottom: '0.4rem',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.1em',
                                            }}
                                        >
                                            Invite Code
                                        </label>
                                        <input
                                            className="retro-input"
                                            placeholder="Paste your invite code here..."
                                            value={inviteCode}
                                            onChange={(e) => setInviteCode(e.target.value)}
                                            required
                                        />
                                    </div>

                                    <RetroButton type="submit" style={{ width: '100%' }}>
                                        {loading ? '⏳ Searching...' : '🎟️ Find My Seat'}
                                    </RetroButton>
                                </form>
                            )}

                            {error && (
                                <p style={{
                                    color: 'var(--color-diner-red)',
                                    fontFamily: 'var(--font-body)',
                                    fontSize: '0.9rem',
                                    marginTop: '1rem',
                                    textAlign: 'center',
                                }}>
                                    ❌ {error}
                                </p>
                            )}
                        </motion.div>
                    ) : (
                        /* Room Created / Joined */
                        <motion.div
                            key="result"
                            className="glass-panel"
                            style={{ padding: '2rem', textAlign: 'center' }}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.4 }}
                        >
                            <span style={{ fontSize: '3rem' }}>🎉</span>
                            <h2
                                className="neon-text-pink"
                                style={{
                                    fontSize: '1.6rem',
                                    margin: '1rem 0 0.5rem',
                                }}
                            >
                                {room.name}
                            </h2>
                            <p
                                style={{
                                    fontFamily: 'var(--font-body)',
                                    color: 'var(--color-chrome)',
                                    marginBottom: '1.5rem',
                                }}
                            >
                                Your screening room is ready!
                            </p>

                            {/* Invite Code Box */}
                            <div
                                style={{
                                    background: 'var(--color-asphalt)',
                                    border: '2px solid var(--color-neon-yellow)',
                                    borderRadius: '8px',
                                    padding: '1rem',
                                    marginBottom: '1.5rem',
                                    boxShadow: '0 0 16px rgba(255,225,77,0.15)',
                                }}
                            >
                                <span
                                    style={{
                                        fontFamily: 'var(--font-body)',
                                        fontSize: '0.75rem',
                                        color: 'var(--color-neon-yellow)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.15em',
                                    }}
                                >
                                    Invite Code
                                </span>
                                <p
                                    style={{
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: '1.2rem',
                                        color: 'var(--color-cream)',
                                        marginTop: '0.4rem',
                                        letterSpacing: '0.2em',
                                        wordBreak: 'break-all',
                                    }}
                                >
                                    {room.invite_code}
                                </p>
                            </div>

                            <RetroButton onClick={copyInviteCode} variant="red">
                                {copied ? '✅ Copied!' : '📋 Copy Invite Code'}
                            </RetroButton>

                            <p
                                style={{
                                    fontFamily: 'var(--font-body)',
                                    fontSize: '0.8rem',
                                    color: 'var(--color-chrome-dark)',
                                    marginTop: '1.5rem',
                                    lineHeight: 1.6,
                                }}
                            >
                                Share this code with friends, then paste a YouTube link and
                                start watching together.
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Back link */}
                <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                    <a
                        href="/"
                        style={{
                            fontFamily: 'var(--font-body)',
                            color: 'var(--color-chrome-dark)',
                            textDecoration: 'underline',
                            fontSize: '0.9rem',
                        }}
                    >
                        ← Back to The Marquee
                    </a>
                </div>
            </section>
        </main>
    );
}
