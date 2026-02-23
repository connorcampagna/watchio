/**
 * ============================================================
 *  Watchio  –  Real-Time WebSocket Server
 *  Handles: join_room, video_play, video_pause,
 *           sync_timestamp, chat_message
 * ============================================================
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { supabase } = require('./lib/supabase');

// ── Config ───────────────────────────────────────────────────
const PORT = process.env.PORT || 8000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

const app = express();
app.use(cors({ origin: '*' }));  // Allow all origins in dev
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',                     // Extension + web app
        methods: ['GET', 'POST'],
    },
});

// ── In-memory room state (lightweight cache) ─────────────────
// Keyed by roomId → { videoUrl, timestamp, isPlaying, users: Map<socketId, userId> }
const roomStates = new Map();

function getOrCreateRoom(roomId) {
    if (!roomStates.has(roomId)) {
        roomStates.set(roomId, {
            videoUrl: null,
            timestamp: 0,
            isPlaying: false,
            users: new Map(),
            hostSocketId: null,
        });
    }
    return roomStates.get(roomId);
}

// ── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', rooms: roomStates.size });
});

// ── REST: create room ────────────────────────────────────────
app.post('/api/rooms', async (req, res) => {
    try {
        const { name, hostId, videoUrl } = req.body;

        // Auto-create a guest user so the FK constraint is satisfied
        const { data: user, error: userErr } = await supabase
            .from('users')
            .upsert(
                { id: hostId, email: `${hostId}@guest.retrodrivein.local`, display_name: 'Watchio Guest' },
                { onConflict: 'id' }
            )
            .select()
            .single();

        if (userErr) throw userErr;

        const { data, error } = await supabase
            .from('rooms')
            .insert({ name, host_id: user.id, video_url: videoUrl })
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('[REST] create room error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── REST: get room by ID ─────────────────────────────────────
app.get('/api/rooms/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Room not found' });
        res.json(data);
    } catch (err) {
        console.error('[REST] get room error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── REST: join room by invite code ───────────────────────────
app.get('/api/rooms/invite/:code', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('rooms')
            .select('*')
            .eq('invite_code', req.params.code)
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Room not found' });
        res.json(data);
    } catch (err) {
        console.error('[REST] invite lookup error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── REST: update room (host changes video URL) ───────────────
app.put('/api/rooms/:id', async (req, res) => {
    try {
        const { video_url } = req.body;
        const { data, error } = await supabase
            .from('rooms')
            .update({ video_url })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('[REST] update room error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── REST: delete room (host ends screening) ──────────────────
app.delete('/api/rooms/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('rooms')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ ok: true });
    } catch (err) {
        console.error('[REST] delete room error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── Socket.io events ─────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`⚡ Socket connected: ${socket.id}`);

    // ── JOIN ROOM ──────────────────────────────────────────────
    socket.on('join_room', async ({ roomId, userId, displayName, isHost }) => {
        socket.join(roomId);

        const room = getOrCreateRoom(roomId);
        room.users.set(socket.id, { userId, displayName, isHost: !!isHost });

        // Track host socket
        if (isHost) {
            room.hostSocketId = socket.id;
            console.log(`👑 ${displayName} is the host of room ${roomId}`);
        }

        console.log(`🎬 ${displayName || userId} joined room ${roomId}`);

        // Tell the newcomer the current state so they can sync
        socket.emit('room_state', {
            timestamp: room.timestamp,
            isPlaying: room.isPlaying,
            videoUrl: room.videoUrl,
            participants: Array.from(room.users.values()),
            hostSocketId: room.hostSocketId,
        });

        // Tell everyone else
        socket.to(roomId).emit('user_joined', {
            userId,
            displayName,
            participants: Array.from(room.users.values()),
        });
    });

    // ── VIDEO PLAY (host only) ─────────────────────────────────
    socket.on('video_play', ({ roomId, timestamp }) => {
        const room = getOrCreateRoom(roomId);
        if (room.hostSocketId && room.hostSocketId !== socket.id) {
            return; // Only host can control playback
        }
        room.isPlaying = true;
        room.timestamp = timestamp;

        console.log(`▶️  Play in ${roomId} at ${timestamp}s`);
        socket.to(roomId).emit('video_play', { timestamp });

        supabase
            .from('rooms')
            .update({ is_playing: true, video_timestamp: timestamp })
            .eq('id', roomId)
            .then();
    });

    // ── VIDEO PAUSE (host only) ────────────────────────────────
    socket.on('video_pause', ({ roomId, timestamp }) => {
        const room = getOrCreateRoom(roomId);
        if (room.hostSocketId && room.hostSocketId !== socket.id) {
            return; // Only host can control playback
        }
        room.isPlaying = false;
        room.timestamp = timestamp;

        console.log(`⏸️  Pause in ${roomId} at ${timestamp}s`);
        socket.to(roomId).emit('video_pause', { timestamp });

        supabase
            .from('rooms')
            .update({ is_playing: false, video_timestamp: timestamp })
            .eq('id', roomId)
            .then();
    });

    // ── SYNC TIMESTAMP (host only – seek / periodic heartbeat) ──
    socket.on('sync_timestamp', ({ roomId, timestamp }) => {
        const room = getOrCreateRoom(roomId);
        if (room.hostSocketId && room.hostSocketId !== socket.id) {
            return; // Only host can seek
        }
        room.timestamp = timestamp;

        socket.to(roomId).emit('sync_timestamp', { timestamp });
    });

    // ── CHAT MESSAGE ───────────────────────────────────────────
    socket.on('chat_message', ({ roomId, userId, displayName, message }) => {
        console.log(`💬 [${roomId}] ${displayName}: ${message}`);
        io.to(roomId).emit('chat_message', {
            userId,
            displayName,
            message,
            sentAt: new Date().toISOString(),
        });
    });

    // ── UPDATE VIDEO URL ───────────────────────────────────────
    socket.on('update_video_url', ({ roomId, videoUrl }) => {
        const room = getOrCreateRoom(roomId);
        room.videoUrl = videoUrl;

        console.log(`🎞️  Video URL updated in ${roomId}: ${videoUrl}`);
        io.to(roomId).emit('update_video_url', { videoUrl });

        supabase
            .from('rooms')
            .update({ video_url: videoUrl })
            .eq('id', roomId)
            .then();
    });

    // ── END ROOM ──────────────────────────────────────────────
    socket.on('end_room', async ({ roomId }) => {
        console.log(`🔚 Room ${roomId} ended by host`);
        io.to(roomId).emit('room_ended', {});

        // Clean up in-memory state
        roomStates.delete(roomId);

        // Delete from database
        await supabase.from('rooms').delete().eq('id', roomId);
    });

    // ── DISCONNECT ─────────────────────────────────────────────
    socket.on('disconnect', () => {
        console.log(`🔌 Socket disconnected: ${socket.id}`);

        // Remove from every room they were in
        for (const [roomId, room] of roomStates.entries()) {
            if (room.users.has(socket.id)) {
                const user = room.users.get(socket.id);
                room.users.delete(socket.id);

                io.to(roomId).emit('user_left', {
                    userId: user.userId,
                    displayName: user.displayName,
                    participants: Array.from(room.users.values()),
                });

                // Clean up empty rooms
                if (room.users.size === 0) {
                    roomStates.delete(roomId);
                    console.log(`🗑️  Room ${roomId} cleaned up (empty)`);
                }
            }
        }
    });
});

// ── Start ────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`\n🎬 Watchio server listening on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health\n`);
});
