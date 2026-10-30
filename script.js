
const SUPABASE_URL = "https://geoqqrhnxdhlfuobkzog.supabase.co";
const SUPABASE_KEY = "sb_publishable_8ck71wsi9GYgmiIyhvFz5g_GnSJVRpY";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const $ = (id) => document.getElementById(id);

let userId = null;
let roomId = null;
let lastMessageId = 0;
let polling = false;

function notice(message) {
  $("notice").textContent = message;
}

function status(message) {
  $("status").textContent = message;
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, b => alphabet[b % alphabet.length])
    .join("");
}

async function initialise() {
  try {
    const { data: sessionData, error: sessionError } =
      await db.auth.getSession();

    if (sessionError) throw sessionError;

    let session = sessionData.session;

    if (!session) {
      const { data, error } = await db.auth.signInAnonymously();
      if (error) throw error;
      session = data.session;
    }

    userId = session.user.id;
    status("Ready");
    $("createBtn").disabled = false;
    $("joinBtn").disabled = false;
    notice("Connected to Supabase. Create or join a room.");
  } catch (error) {
    status("Connection failed");
    notice(error.message);
  }
}

async function createRoom() {
  $("createBtn").disabled = true;

  try {
    let code;
    let data;
    let error;

    for (let attempt = 0; attempt < 5; attempt++) {
      code = roomCode();

      ({ data, error } = await db.rpc("create_game_room", {
        p_room_code: code
      }));

      if (!error) break;

      if (!error.message.includes("duplicate key")) {
        throw error;
      }
    }

    if (error) throw error;

    openRoom(data, code);
  } catch (error) {
    notice(error.message);
  } finally {
    $("createBtn").disabled = false;
  }
}

async function joinRoom() {
  const code = $("roomInput").value.trim().toUpperCase();

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    notice("Enter a valid six-character room code.");
    return;
  }

  $("joinBtn").disabled = true;

  try {
    const { data, error } = await db.rpc("join_game_room", {
      p_room_code: code
    });

    if (error) throw error;

    openRoom(data, code);
  } catch (error) {
    notice(error.message);
  } finally {
    $("joinBtn").disabled = false;
  }
}

function openRoom(id, code) {
  roomId = id;
  lastMessageId = 0;
  $("messages").replaceChildren();
  $("roomCode").textContent = code;
  $("lobby").classList.add("hidden");
  $("game").classList.remove("hidden");

  localStorage.setItem("testRoomCode", code);

  notice("Room connected. You can now send messages.");
  status("Room connected");

  pollMessages();
}

function showMessage(message) {
  const element = document.createElement("div");
  const mine = message.sender_id === userId;

  element.className = "message" + (mine ? " mine" : "");

  const sender = document.createElement("small");
  sender.textContent = mine ? "You" : "Other player";

  const content = document.createElement("div");
  content.textContent = message.content;

  element.append(sender, content);
  $("messages").appendChild(element);
  $("messages").scrollTop = $("messages").scrollHeight;
}

async function pollMessages() {
  if (!roomId || polling) return;

  polling = true;

  try {
    const { data, error } = await db.rpc("get_game_messages", {
      p_room_id: roomId,
      p_after_id: lastMessageId
    });

    if (error) throw error;

    for (const message of data) {
      showMessage(message);
      lastMessageId = Math.max(lastMessageId, message.id);
    }

    status("Connected");
  } catch (error) {
    status("Connection issue");
    notice("Message check failed: " + error.message);
  } finally {
    polling = false;
  }
}

async function sendMessage(event) {
  event.preventDefault();

  if (!roomId) return;

  const input = $("messageInput");
  const content = input.value.trim();

  if (!content) return;

  const sendButton = $("chatForm").querySelector("button");
  sendButton.disabled = true;

  try {
    const { error } = await db.rpc("send_game_message", {
      p_room_id: roomId,
      p_content: content
    });

    if (error) throw error;

    input.value = "";
    await pollMessages();
  } catch (error) {
    notice("Could not send: " + error.message);
  } finally {
    sendButton.disabled = false;
  }
}

$("createBtn").addEventListener("click", createRoom);
$("joinBtn").addEventListener("click", joinRoom);
$("chatForm").addEventListener("submit", sendMessage);

$("copyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("roomCode").textContent);
    notice("Room code copied.");
  } catch {
    notice("Copy the room code shown above.");
  }
});

setInterval(pollMessages, 1000);
initialise();

