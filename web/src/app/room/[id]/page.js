'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import Starfield from '@/components/Starfield';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';
const SYNC_THRESHOLD = 2;

function generateId() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
}

// Extract YouTube video ID
function getYouTubeId(url) {
    if (!url) return null;
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/);
    return m ? m[1] : null;
}

function isDirectVideo(url) {
    return url && url.match(/\.(mp4|webm|ogg|m3u8)(\?|$)/i);
}

function getDirectUrl(url) {
    if (!url) return null;
    if (isDirectVideo(url)) return url;
    return null;
}

export default function CinemaRoomWrapper() {
    return (
        <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a14' }} />}>
            <CinemaRoom />
        </Suspense>
    );
}

function CinemaRoom() {
    const params = useParams();
    const searchParams = useSearchParams();
    const roomId = params.id;
    const router = useRouter();
    const urlIsHost = searchParams.get('host') === 'true';

    // Connection
    const socketRef = useRef(null);
    const videoRef = useRef(null);
    const ytPlayerRef = useRef(null);
    const ytContainerRef = useRef(null);
    const isSyncingRef = useRef(false);
    const pendingSyncRef = useRef(null);
    const ytReadyRef = useRef(false);
    const [connected, setConnected] = useState(false);

    // Room state
    const [room, setRoom] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // User
    const [userId] = useState(() => generateId());
    const [displayName, setDisplayName] = useState('');
    const [hasJoined, setHasJoined] = useState(false);

    // Host controls
    const [isHost, setIsHost] = useState(urlIsHost);
    const [showUrlEditor, setShowUrlEditor] = useState(false);
    const [newVideoUrl, setNewVideoUrl] = useState('');
    const [currentVideoUrl, setCurrentVideoUrl] = useState('');

    // Chat
    const [messages, setMessages] = useState([]);
    const [inputMsg, setInputMsg] = useState('');
    const [chatOpen, setChatOpen] = useState(true);
    const chatEndRef = useRef(null);

    // Participants
    const [participants, setParticipants] = useState([]);

    // Video sync
    const [isPlaying, setIsPlaying] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    // Derived
    const ytVideoId = getYouTubeId(currentVideoUrl || room?.video_url);
    const directUrl = getDirectUrl(currentVideoUrl || room?.video_url);

    // Fetch room info
    useEffect(() => {
        async function fetchRoom() {
            try {
                const res = await fetch(`${SERVER_URL}/api/rooms/${roomId}`);
                if (!res.ok) throw new Error('Room not found');
                const data = await res.json();
                setRoom(data);
                setCurrentVideoUrl(data.video_url || '');
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        if (roomId) fetchRoom();
    }, [roomId]);

    // Socket connection
    useEffect(() => {
        if (!hasJoined) return;

        const socket = io(SERVER_URL, {
            transports: ['websocket', 'polling'],
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            setConnected(true);
            socket.emit('join_room', { roomId, userId, displayName, isHost });
        });

        socket.on('disconnect', () => setConnected(false));

        socket.on('room_state', (data) => {
            setParticipants(data.participants || []);
            setIsPlaying(data.isPlaying);
            // Store pending sync — YT player may not be ready yet
            pendingSyncRef.current = { timestamp: data.timestamp, isPlaying: data.isPlaying };
            syncVideoTo(data.timestamp, data.isPlaying);
        });

        socket.on('user_joined', (data) => {
            setParticipants(data.participants || []);
            setMessages(prev => [...prev, {
                system: true,
                message: `${data.displayName || 'Someone'} took their seat 🎬`,
                sentAt: new Date().toISOString(),
            }]);
        });

        socket.on('user_left', (data) => {
            setParticipants(data.participants || []);
            setMessages(prev => [...prev, {
                system: true,
                message: `${data.displayName || 'Someone'} left the theater 👋`,
                sentAt: new Date().toISOString(),
            }]);
        });

        socket.on('video_play', (data) => {
            setIsPlaying(true);
            isSyncingRef.current = true;
            setIsSyncing(true);
            pendingSyncRef.current = { timestamp: data.timestamp, isPlaying: true };
            syncVideoTo(data.timestamp, true);
            setTimeout(() => { isSyncingRef.current = false; setIsSyncing(false); }, 1000);
        });

        socket.on('video_pause', (data) => {
            setIsPlaying(false);
            isSyncingRef.current = true;
            setIsSyncing(true);
            pendingSyncRef.current = { timestamp: data.timestamp, isPlaying: false };
            syncVideoTo(data.timestamp, false);
            setTimeout(() => { isSyncingRef.current = false; setIsSyncing(false); }, 1000);
        });

        socket.on('sync_timestamp', (data) => {
            const currentTime = getCurrentVideoTime();
            if (currentTime !== null && Math.abs(currentTime - data.timestamp) > SYNC_THRESHOLD) {
                isSyncingRef.current = true;
                setIsSyncing(true);
                seekVideoTo(data.timestamp);
                setTimeout(() => { isSyncingRef.current = false; setIsSyncing(false); }, 1000);
            }
        });

        socket.on('chat_message', (data) => {
            setMessages(prev => [...prev.slice(-200), data]);
        });

        socket.on('update_video_url', (data) => {
            setCurrentVideoUrl(data.videoUrl);
            setRoom(prev => prev ? { ...prev, video_url: data.videoUrl } : prev);
            setMessages(prev => [...prev, {
                system: true,
                message: '🎞️ The projectionist loaded a new film!',
                sentAt: new Date().toISOString(),
            }]);
        });

        socket.on('room_ended', () => {
            router.push('/room?ended=true');
        });

        return () => {
            socket.disconnect();
        };
    }, [hasJoined, roomId, userId, displayName]);

    // ── Unified video helpers (work for both YT and HTML5) ────
    function getCurrentVideoTime() {
        if (ytPlayerRef.current && ytReadyRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
            return ytPlayerRef.current.getCurrentTime();
        }
        if (videoRef.current) return videoRef.current.currentTime;
        return null;
    }

    function seekVideoTo(time) {
        if (ytPlayerRef.current && ytReadyRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
            ytPlayerRef.current.seekTo(time, true);
        } else if (ytPlayerRef.current && !ytReadyRef.current) {
            // Player exists but isn't ready — queue for onReady
            pendingSyncRef.current = { timestamp: time, isPlaying: null };
        } else if (videoRef.current) {
            videoRef.current.currentTime = time;
        }
    }

    function syncVideoTo(timestamp, shouldPlay) {
        if (ytPlayerRef.current && ytReadyRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
            try {
                ytPlayerRef.current.seekTo(timestamp, true);
                if (shouldPlay) {
                    ytPlayerRef.current.playVideo();
                } else {
                    ytPlayerRef.current.pauseVideo();
                }
            } catch (err) {
                console.warn('[Watchio] syncVideoTo failed, queuing for retry:', err);
                pendingSyncRef.current = { timestamp, isPlaying: shouldPlay };
            }
        } else if (ytPlayerRef.current && !ytReadyRef.current) {
            // Player exists but isn't ready yet — queue for when it's ready
            pendingSyncRef.current = { timestamp, isPlaying: shouldPlay };
        } else if (videoRef.current) {
            videoRef.current.currentTime = timestamp;
            if (shouldPlay) {
                videoRef.current.play().catch(() => { });
            } else {
                videoRef.current.pause();
            }
        } else {
            // Nothing ready — queue so it's applied when a player appears
            pendingSyncRef.current = { timestamp, isPlaying: shouldPlay };
        }
    }

    // ── YouTube IFrame Player API ─────────────────────────────
    useEffect(() => {
        if (!hasJoined || !ytVideoId) return;

        // Load YT IFrame API script if not present
        if (!window.YT) {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(tag);
        }

        function createPlayer() {
            if (!ytContainerRef.current) return;
            // Destroy old player
            ytReadyRef.current = false;
            if (ytPlayerRef.current) {
                try { ytPlayerRef.current.destroy(); } catch (e) { }
            }

            ytPlayerRef.current = new window.YT.Player(ytContainerRef.current, {
                videoId: ytVideoId,
                playerVars: {
                    autoplay: 1,
                    controls: isHost ? 1 : 0,
                    modestbranding: 1,
                    rel: 0,
                    disablekb: isHost ? 0 : 1,
                },
                events: {
                    onReady: () => {
                        ytReadyRef.current = true;
                        // Apply any sync that arrived before the player was ready
                        if (pendingSyncRef.current) {
                            const { timestamp, isPlaying: shouldPlay } = pendingSyncRef.current;
                            pendingSyncRef.current = null;
                            if (shouldPlay !== null) {
                                syncVideoTo(timestamp, shouldPlay);
                            } else {
                                seekVideoTo(timestamp);
                            }
                        }
                    },
                    onStateChange: (event) => {
                        if (!isHost) return; // Only host emits
                        if (isSyncingRef.current) return;

                        const player = event.target;
                        const timestamp = player.getCurrentTime();

                        if (event.data === window.YT.PlayerState.PLAYING) {
                            socketRef.current?.emit('video_play', { roomId, timestamp });
                        } else if (event.data === window.YT.PlayerState.PAUSED) {
                            socketRef.current?.emit('video_pause', { roomId, timestamp });
                        } else if (event.data === window.YT.PlayerState.BUFFERING) {
                            // Buffering usually means the host seeked — sync after position settles
                            setTimeout(() => {
                                if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
                                    socketRef.current?.emit('sync_timestamp', {
                                        roomId,
                                        timestamp: ytPlayerRef.current.getCurrentTime(),
                                    });
                                }
                            }, 500);
                        }
                    },
                },
            });
        }

        if (window.YT && window.YT.Player) {
            createPlayer();
        } else {
            window.onYouTubeIframeAPIReady = createPlayer;
        }

        // Host heartbeat sync for YT (also detects seek-while-paused)
        let heartbeat;
        let lastSyncedTime = 0;
        if (isHost) {
            heartbeat = setInterval(() => {
                if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
                    const currentTime = ytPlayerRef.current.getCurrentTime();
                    const state = ytPlayerRef.current.getPlayerState();

                    if (state === window.YT?.PlayerState?.PLAYING) {
                        socketRef.current?.emit('sync_timestamp', {
                            roomId,
                            timestamp: currentTime,
                        });
                        lastSyncedTime = currentTime;
                    } else if (
                        state === window.YT?.PlayerState?.PAUSED &&
                        Math.abs(currentTime - lastSyncedTime) > SYNC_THRESHOLD
                    ) {
                        // Host seeked while paused
                        socketRef.current?.emit('sync_timestamp', {
                            roomId,
                            timestamp: currentTime,
                        });
                        lastSyncedTime = currentTime;
                    }
                }
            }, 3000);
        }

        return () => {
            if (heartbeat) clearInterval(heartbeat);
        };
    }, [hasJoined, ytVideoId, isHost, roomId]);

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Video event handlers (HTML5 <video> only — YT uses its own API)
    const handlePlay = useCallback(() => {
        if (isSyncingRef.current || !socketRef.current || !isHost) return;
        socketRef.current.emit('video_play', {
            roomId,
            timestamp: videoRef.current?.currentTime || 0,
        });
    }, [roomId, isHost]);

    const handlePause = useCallback(() => {
        if (isSyncingRef.current || !socketRef.current || !isHost) return;
        socketRef.current.emit('video_pause', {
            roomId,
            timestamp: videoRef.current?.currentTime || 0,
        });
    }, [roomId, isHost]);

    const handleSeeked = useCallback(() => {
        if (isSyncingRef.current || !socketRef.current || !isHost) return;
        socketRef.current.emit('sync_timestamp', {
            roomId,
            timestamp: videoRef.current?.currentTime || 0,
        });
    }, [roomId, isHost]);

    function handleSendChat(e) {
        e.preventDefault();
        if (!inputMsg.trim() || !socketRef.current) return;
        socketRef.current.emit('chat_message', {
            roomId,
            userId,
            displayName,
            message: inputMsg.trim(),
        });
        setInputMsg('');
    }

    function handleJoinRoom() {
        if (!displayName.trim()) return;
        setHasJoined(true);
    }

    function copyInviteCode() {
        if (room?.invite_code) {
            navigator.clipboard.writeText(room.invite_code);
        }
    }

    function handleLeaveRoom() {
        if (socketRef.current) {
            socketRef.current.disconnect();
        }
        router.push('/room');
    }

    function handleChangeUrl() {
        if (!newVideoUrl.trim() || !socketRef.current) return;
        socketRef.current.emit('update_video_url', {
            roomId,
            videoUrl: newVideoUrl.trim(),
        });
        setShowUrlEditor(false);
        setNewVideoUrl('');
    }

    async function handleEndRoom() {
        if (!confirm('End the screening? This will close the room for everyone and delete it.')) return;
        if (socketRef.current) {
            socketRef.current.emit('end_room', { roomId });
        }
    }

    if (loading) {
        return (
            <main style={styles.loadingScreen}>
                <Starfield count={40} />
                <div style={styles.loadingContent}>
                    <span style={{ fontSize: '3rem' }}>🎬</span>
                    <p style={styles.loadingText}>Setting up the projector...</p>
                </div>
            </main>
        );
    }

    if (error) {
        return (
            <main style={styles.loadingScreen}>
                <Starfield count={40} />
                <div style={styles.loadingContent}>
                    <span style={{ fontSize: '3rem' }}>📽️</span>
                    <p style={styles.loadingText}>Film reel missing!</p>
                    <p style={{ color: '#c91a1a', fontFamily: 'var(--font-body)' }}>{error}</p>
                    <a href="/room" style={styles.backLink}>← Back to Box Office</a>
                </div>
            </main>
        );
    }

    // Join gate
    if (!hasJoined) {
        return (
            <main style={styles.loadingScreen}>
                <Starfield count={40} />
                <motion.div
                    style={styles.joinCard}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                >
                    <span style={{ fontSize: '3rem' }}>🎟️</span>
                    <h2 style={styles.joinTitle}>{room?.name || 'Watchio'}</h2>
                    <p style={styles.joinSubtitle}>Enter your name to take your seat</p>
                    <input
                        style={styles.joinInput}
                        placeholder="Your display name..."
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                        autoFocus
                    />
                    <button style={styles.joinBtn} onClick={handleJoinRoom}>
                        🎬 Take Your Seat
                    </button>
                </motion.div>
            </main>
        );
    }

    return (
        <main style={styles.cinema} className="cinema-room">
            <Starfield count={30} />

            {/* Mobile responsive styles */}
            <style>{`
                @media (max-width: 768px) {
                    .cinema-room .cinema-header {
                        flex-wrap: wrap;
                        padding: 0.5rem 0.75rem !important;
                        gap: 0.5rem;
                    }
                    .cinema-room .cinema-header-left {
                        flex: 1;
                        min-width: 0;
                    }
                    .cinema-room .cinema-header-left h1 {
                        font-size: 0.85rem !important;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    .cinema-room .cinema-header-right {
                        flex-wrap: wrap;
                        gap: 0.4rem !important;
                        justify-content: flex-end;
                    }
                    .cinema-room .cinema-header-right button,
                    .cinema-room .cinema-header-right span {
                        font-size: 0.65rem !important;
                        padding: 0.2rem 0.4rem !important;
                    }
                    .cinema-room .cinema-main {
                        flex-direction: column !important;
                    }
                    .cinema-room .cinema-screen-container {
                        padding: 0.5rem !important;
                    }
                    .cinema-room .cinema-chat-sidebar {
                        width: 100% !important;
                        max-height: 300px;
                        border-left: none !important;
                        border-top: 1px solid rgba(201,26,26,0.2);
                    }
                    .cinema-room .cinema-audience-row {
                        padding: 0.5rem !important;
                        gap: 1rem !important;
                    }
                    .cinema-room .cinema-url-editor {
                        flex-wrap: wrap;
                        padding: 0.5rem 0.75rem !important;
                    }
                    .cinema-room .cinema-url-editor input {
                        min-width: 0;
                        width: 100%;
                    }
                    .cinema-room .cinema-speaker-row {
                        display: none !important;
                    }
                }
                @media (max-width: 480px) {
                    .cinema-room .cinema-header-right {
                        width: 100%;
                    }
                    .cinema-room .cinema-chat-sidebar {
                        max-height: 250px;
                    }
                }
            `}</style>

            {/* Top bar */}
            <header style={styles.header} className="cinema-header">
                <div style={styles.headerLeft} className="cinema-header-left">
                    <h1 style={styles.roomTitle}>🎬 {room?.name}</h1>
                    <span style={styles.connectionDot(connected)} />
                </div>
                <div style={styles.headerRight} className="cinema-header-right">
                    <span style={styles.participantBadge}>
                        🎟️ {participants.length || 1} seated
                    </span>
                    <button style={styles.inviteBtn} onClick={copyInviteCode} title="Copy invite code">
                        📋 {room?.invite_code}
                    </button>
                    {isHost ? (
                        <>
                            <button
                                style={styles.hostBtn}
                                onClick={() => setShowUrlEditor(!showUrlEditor)}
                                title="Change video URL"
                            >
                                🎞️ Change Film
                            </button>
                            <button
                                style={styles.endRoomBtn}
                                onClick={handleEndRoom}
                                title="End screening"
                            >
                                🔚 End
                            </button>
                        </>
                    ) : (
                        <button
                            style={styles.leaveBtn}
                            onClick={handleLeaveRoom}
                            title="Leave room"
                        >
                            🚪 Leave
                        </button>
                    )}
                    <button
                        style={styles.chatToggle}
                        onClick={() => setChatOpen(!chatOpen)}
                    >
                        💬
                    </button>
                </div>
            </header>

            {/* Host URL editor bar */}
            <AnimatePresence>
                {showUrlEditor && (
                    <motion.div
                        style={styles.urlEditorBar}
                        className="cinema-url-editor"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <span style={styles.urlEditorLabel}>🎞️ Load a new film:</span>
                        <input
                            style={styles.urlEditorInput}
                            placeholder="Paste a YouTube or video URL..."
                            value={newVideoUrl}
                            onChange={(e) => setNewVideoUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleChangeUrl()}
                            autoFocus
                        />
                        <button style={styles.urlEditorBtn} onClick={handleChangeUrl}>
                            ▶ Load
                        </button>
                        <button
                            style={styles.urlEditorCancel}
                            onClick={() => setShowUrlEditor(false)}
                        >
                            ✕
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main content area */}
            <div style={styles.mainArea} className="cinema-main">
                {/* The Screen */}
                <div style={{
                    ...styles.screenContainer,
                    ...(chatOpen ? {} : { maxWidth: '100%' }),
                }} className="cinema-screen-container">
                    {/* Screen frame */}
                    <div style={styles.screenFrame}>
                        {/* Projector light cone */}
                        <div style={styles.projectorLight} />

                        {/* The actual screen */}
                        <div style={styles.screen}>
                            {directUrl ? (
                                <video
                                    ref={videoRef}
                                    src={directUrl}
                                    style={styles.video}
                                    controls={isHost}
                                    onPlay={isHost ? handlePlay : undefined}
                                    onPause={isHost ? handlePause : undefined}
                                    onSeeked={isHost ? handleSeeked : undefined}
                                />
                            ) : ytVideoId ? (
                                <div
                                    ref={ytContainerRef}
                                    style={styles.video}
                                />
                            ) : (
                                <div style={styles.noVideo}>
                                    <span style={{ fontSize: '4rem' }}>📽️</span>
                                    <p style={styles.noVideoText}>No film loaded</p>
                                    <p style={styles.noVideoSub}>
                                        The host hasn&apos;t set a video URL yet
                                    </p>
                                </div>
                            )}

                            {/* Film grain overlay */}
                            <div style={styles.filmGrain} />

                            {/* Click-blocking overlay for non-hosts */}
                            {!isHost && (
                                <>
                                    <div style={styles.clickBlocker} />
                                    <div style={styles.hostControlsBadge}>
                                        👑 Host controls playback
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Screen border posts */}
                        <div style={styles.screenPostLeft} />
                        <div style={styles.screenPostRight} />
                    </div>

                    {/* Speaker row */}
                    <div style={styles.speakerRow} className="cinema-speaker-row">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} style={styles.speaker}>🔊</div>
                        ))}
                    </div>
                </div>

                {/* Chat sidebar */}
                <AnimatePresence>
                    {chatOpen && (
                        <motion.div
                            style={styles.chatSidebar}
                            className="cinema-chat-sidebar"
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 340, opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            <div style={styles.chatHeader}>
                                <h3 style={styles.chatTitle}>🍿 The Lobby</h3>
                            </div>

                            <div style={styles.chatMessages}>
                                {messages.length === 0 && (
                                    <p style={styles.chatEmpty}>
                                        No messages yet... say hi! 👋
                                    </p>
                                )}
                                {messages.map((msg, i) => (
                                    <div key={i} style={msg.system ? styles.systemMsg : styles.chatMsg}>
                                        {!msg.system && (
                                            <span style={styles.chatName}>{msg.displayName}</span>
                                        )}
                                        <span style={msg.system ? styles.systemText : styles.chatText}>
                                            {msg.message}
                                        </span>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>

                            <form style={styles.chatForm} onSubmit={handleSendChat}>
                                <input
                                    style={styles.chatInput}
                                    placeholder="Type a message..."
                                    value={inputMsg}
                                    onChange={(e) => setInputMsg(e.target.value)}
                                />
                                <button style={styles.chatSend} type="submit">➤</button>
                            </form>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Audience seats */}
            <div style={styles.audienceRow} className="cinema-audience-row">
                {participants.map((p, i) => (
                    <motion.div
                        key={p.userId || i}
                        style={styles.seat}
                        initial={{ y: 30, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: i * 0.1 }}
                    >
                        <span style={styles.seatEmoji}>💺</span>
                        <span style={styles.seatName}>{p.displayName || 'Guest'}</span>
                    </motion.div>
                ))}
            </div>
        </main>
    );
}

// ── Styles ──────────────────────────────────────────────────
const styles = {
    cinema: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #0a0a14 0%, #0d0d1a 40%, #1a1a2e 100%)',
        position: 'relative',
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.75rem 1.5rem',
        background: 'rgba(0,0,0,0.6)',
        borderBottom: '1px solid rgba(201,26,26,0.3)',
        backdropFilter: 'blur(10px)',
        zIndex: 10,
        position: 'relative',
    },
    headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
    },
    headerRight: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
    },
    roomTitle: {
        fontFamily: 'var(--font-display, Georgia, serif)',
        fontSize: '1.1rem',
        color: '#ffe14d',
        textShadow: '0 0 20px rgba(255,225,77,0.4)',
        margin: 0,
    },
    connectionDot: (connected) => ({
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: connected ? '#4ade80' : '#ef4444',
        boxShadow: connected ? '0 0 8px #4ade80' : '0 0 8px #ef4444',
    }),
    participantBadge: {
        fontFamily: 'var(--font-body, monospace)',
        fontSize: '0.8rem',
        color: '#fcd9b6',
        background: 'rgba(255,255,255,0.05)',
        padding: '0.3rem 0.6rem',
        borderRadius: '4px',
        border: '1px solid rgba(255,255,255,0.1)',
    },
    inviteBtn: {
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: '0.75rem',
        color: '#ffe14d',
        background: 'rgba(255,225,77,0.1)',
        border: '1px solid rgba(255,225,77,0.3)',
        borderRadius: '4px',
        padding: '0.3rem 0.6rem',
        cursor: 'pointer',
        letterSpacing: '0.05em',
    },
    hostBtn: {
        fontFamily: 'var(--font-body, monospace)',
        fontSize: '0.75rem',
        color: '#ffe14d',
        background: 'rgba(255,225,77,0.15)',
        border: '1px solid rgba(255,225,77,0.4)',
        borderRadius: '4px',
        padding: '0.3rem 0.6rem',
        cursor: 'pointer',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
    },
    endRoomBtn: {
        fontFamily: 'var(--font-body, monospace)',
        fontSize: '0.75rem',
        color: '#ff4444',
        background: 'rgba(255,68,68,0.1)',
        border: '1px solid rgba(255,68,68,0.4)',
        borderRadius: '4px',
        padding: '0.3rem 0.6rem',
        cursor: 'pointer',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
    },
    leaveBtn: {
        fontFamily: 'var(--font-body, monospace)',
        fontSize: '0.75rem',
        color: '#d4d4d4',
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '4px',
        padding: '0.3rem 0.6rem',
        cursor: 'pointer',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
    },
    urlEditorBar: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.6rem 1.5rem',
        background: 'rgba(255,225,77,0.05)',
        borderBottom: '1px solid rgba(255,225,77,0.15)',
        position: 'relative',
        zIndex: 9,
        overflow: 'hidden',
    },
    urlEditorLabel: {
        fontFamily: 'var(--font-body, monospace)',
        fontSize: '0.8rem',
        color: '#ffe14d',
        whiteSpace: 'nowrap',
    },
    urlEditorInput: {
        flex: 1,
        background: 'rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,225,77,0.3)',
        borderRadius: '4px',
        padding: '0.4rem 0.75rem',
        color: '#e0d6c8',
        fontFamily: 'var(--font-body, monospace)',
        fontSize: '0.85rem',
        outline: 'none',
    },
    urlEditorBtn: {
        fontFamily: 'var(--font-body, monospace)',
        fontSize: '0.8rem',
        color: '#0d0d0d',
        background: '#ffe14d',
        border: 'none',
        borderRadius: '4px',
        padding: '0.4rem 1rem',
        cursor: 'pointer',
        fontWeight: 700,
        whiteSpace: 'nowrap',
    },
    urlEditorCancel: {
        background: 'transparent',
        border: 'none',
        color: '#888',
        cursor: 'pointer',
        fontSize: '1rem',
        padding: '0.3rem',
    },
    chatToggle: {
        fontSize: '1.2rem',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: '0.3rem',
    },
    mainArea: {
        flex: 1,
        display: 'flex',
        position: 'relative',
        zIndex: 1,
        overflow: 'hidden',
    },
    screenContainer: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        transition: 'all 0.3s',
    },
    screenFrame: {
        position: 'relative',
        width: '100%',
        maxWidth: '960px',
    },
    projectorLight: {
        position: 'absolute',
        top: '-60px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '4px',
        height: '60px',
        background: 'linear-gradient(180deg, rgba(255,255,200,0.6), rgba(255,255,200,0))',
        filter: 'blur(2px)',
        zIndex: 5,
    },
    screen: {
        position: 'relative',
        width: '100%',
        aspectRatio: '16/9',
        background: '#000',
        borderRadius: '4px',
        overflow: 'hidden',
        border: '3px solid #333',
        boxShadow: `
            0 0 60px rgba(201,26,26,0.15),
            0 0 120px rgba(201,26,26,0.05),
            inset 0 0 40px rgba(0,0,0,0.5)
        `,
    },
    video: {
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        border: 'none',
    },
    filmGrain: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`,
        pointerEvents: 'none',
        opacity: 0.4,
    },
    screenPostLeft: {
        position: 'absolute',
        bottom: 0,
        left: '-8px',
        width: '6px',
        height: '110%',
        background: 'linear-gradient(180deg, #444, #222)',
        borderRadius: '3px',
    },
    screenPostRight: {
        position: 'absolute',
        bottom: 0,
        right: '-8px',
        width: '6px',
        height: '110%',
        background: 'linear-gradient(180deg, #444, #222)',
        borderRadius: '3px',
    },
    speakerRow: {
        display: 'flex',
        justifyContent: 'center',
        gap: '2rem',
        marginTop: '1rem',
        opacity: 0.3,
    },
    speaker: {
        fontSize: '0.8rem',
    },
    noVideo: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '0.5rem',
    },
    noVideoText: {
        fontFamily: 'var(--font-display, Georgia, serif)',
        color: '#c91a1a',
        fontSize: '1.4rem',
        textShadow: '0 0 20px rgba(201,26,26,0.5)',
    },
    noVideoSub: {
        fontFamily: 'var(--font-body, monospace)',
        color: '#666',
        fontSize: '0.85rem',
    },
    clickBlocker: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 4,
        cursor: 'not-allowed',
        background: 'transparent',
    },
    hostControlsBadge: {
        position: 'absolute',
        bottom: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.7)',
        color: '#ffe14d',
        fontFamily: 'var(--font-body, monospace)',
        fontSize: '0.75rem',
        padding: '0.3rem 0.8rem',
        borderRadius: '20px',
        border: '1px solid rgba(255,225,77,0.2)',
        letterSpacing: '0.05em',
        zIndex: 5,
        pointerEvents: 'none',
    },
    // Chat sidebar
    chatSidebar: {
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(10,10,20,0.95)',
        borderLeft: '1px solid rgba(201,26,26,0.2)',
        overflow: 'hidden',
        minWidth: 0,
    },
    chatHeader: {
        padding: '0.75rem 1rem',
        borderBottom: '1px solid rgba(255,225,77,0.15)',
    },
    chatTitle: {
        fontFamily: 'var(--font-display, Georgia, serif)',
        fontSize: '1rem',
        color: '#ffe14d',
        margin: 0,
        textShadow: '0 0 12px rgba(255,225,77,0.3)',
    },
    chatMessages: {
        flex: 1,
        overflowY: 'auto',
        padding: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
    },
    chatEmpty: {
        fontFamily: 'var(--font-body, monospace)',
        color: '#555',
        fontSize: '0.8rem',
        textAlign: 'center',
        marginTop: '2rem',
    },
    chatMsg: {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
    },
    chatName: {
        fontFamily: 'var(--font-body, monospace)',
        fontSize: '0.7rem',
        color: '#ffe14d',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },
    chatText: {
        fontFamily: 'var(--font-body, monospace)',
        fontSize: '0.85rem',
        color: '#e0d6c8',
        lineHeight: 1.4,
    },
    systemMsg: {
        textAlign: 'center',
        padding: '0.25rem 0',
    },
    systemText: {
        fontFamily: 'var(--font-body, monospace)',
        fontSize: '0.75rem',
        color: '#666',
        fontStyle: 'italic',
    },
    chatForm: {
        display: 'flex',
        gap: '0.5rem',
        padding: '0.75rem',
        borderTop: '1px solid rgba(255,255,255,0.05)',
    },
    chatInput: {
        flex: 1,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '4px',
        padding: '0.5rem 0.75rem',
        color: '#e0d6c8',
        fontFamily: 'var(--font-body, monospace)',
        fontSize: '0.85rem',
        outline: 'none',
    },
    chatSend: {
        background: 'rgba(201,26,26,0.2)',
        border: '1px solid rgba(201,26,26,0.4)',
        borderRadius: '4px',
        padding: '0.5rem 0.75rem',
        cursor: 'pointer',
        fontSize: '1rem',
    },
    // Audience row
    audienceRow: {
        display: 'flex',
        justifyContent: 'center',
        gap: '1.5rem',
        padding: '1rem 1.5rem',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(30,10,10,0.5) 100%)',
        borderTop: '2px solid rgba(255,225,77,0.08)',
        flexWrap: 'wrap',
        position: 'relative',
        zIndex: 1,
    },
    seat: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.25rem',
    },
    seatEmoji: {
        fontSize: '1.5rem',
    },
    seatName: {
        fontFamily: 'var(--font-body, monospace)',
        fontSize: '0.65rem',
        color: '#888',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        maxWidth: '60px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    // Loading / Error / Join screens
    loadingScreen: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a14',
        position: 'relative',
    },
    loadingContent: {
        textAlign: 'center',
        position: 'relative',
        zIndex: 1,
    },
    loadingText: {
        fontFamily: 'var(--font-display, Georgia, serif)',
        color: '#ffe14d',
        fontSize: '1.2rem',
        textShadow: '0 0 20px rgba(255,225,77,0.3)',
        marginTop: '1rem',
    },
    backLink: {
        fontFamily: 'var(--font-body, monospace)',
        color: '#888',
        textDecoration: 'underline',
        fontSize: '0.85rem',
        marginTop: '1rem',
        display: 'inline-block',
    },
    joinCard: {
        background: 'rgba(15,15,25,0.9)',
        border: '1px solid rgba(201,26,26,0.3)',
        borderRadius: '12px',
        padding: '2.5rem',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        maxWidth: '400px',
        width: '90%',
        position: 'relative',
        zIndex: 1,
        boxShadow: '0 0 60px rgba(201,26,26,0.1)',
    },
    joinTitle: {
        fontFamily: 'var(--font-display, Georgia, serif)',
        color: '#c91a1a',
        fontSize: '1.6rem',
        textShadow: '0 0 30px rgba(201,26,26,0.5)',
        margin: 0,
    },
    joinSubtitle: {
        fontFamily: 'var(--font-body, monospace)',
        color: '#888',
        fontSize: '0.85rem',
        margin: 0,
    },
    joinInput: {
        width: '100%',
        background: 'rgba(255,255,255,0.05)',
        border: '2px solid rgba(255,225,77,0.3)',
        borderRadius: '6px',
        padding: '0.75rem 1rem',
        color: '#e0d6c8',
        fontFamily: 'var(--font-body, monospace)',
        fontSize: '1rem',
        outline: 'none',
        textAlign: 'center',
    },
    joinBtn: {
        width: '100%',
        padding: '0.75rem',
        fontFamily: 'var(--font-body, monospace)',
        fontSize: '1rem',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: '#0d0d0d',
        background: 'linear-gradient(180deg, #c91a1a 0%, #8b1111 100%)',
        border: '2px solid #c91a1a',
        borderRadius: '6px',
        cursor: 'pointer',
        boxShadow: '0 0 20px rgba(201,26,26,0.3)',
        fontWeight: 700,
    },
};
