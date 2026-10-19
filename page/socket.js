// Runs in the page's own world, before coomeet's code (see scripts/model-scraper.js).
// Looks models up straight from coomeet's server, over the app's own
// logged-in websocket, instead of opening each one's dialog page.
//
// The app speaks JSON over that socket, sent as a Blob:
//   { event: { Cmd, Cid }, data }
// and the server answers with the same Cid. Opening a dialog, the app asks:
//   GetContact     { id }       → data[id]: { username, avatar: { s, m },
//                                  accountDeleted, … } — "ContactInfo" for a
//                                  contact, "ReferralInfo" for a stranger
//   GetAuthorStory { womanId }  → data.story: her current story, or
//                                  { code: 402, comment: "Story not found…" }
// The story comes back whether or not she's a contact: the story ring that
// needs a friend request is only how the page shows it.

(() => {
  const SOCKET = "wspr.coomeet.com";
  const CDN = "https://n.coomeet.com/";

  // Request ids of our own ("s1", "s2", …), so replies can't be mistaken for
  // the app's, which number theirs "1", "2", ….
  let lastCid = 0;
  const waiting = new Map();

  // The app's socket, kept as it's created — and again if the app
  // reconnects. It only takes requests once coomeet has sent it an
  // "Authorization" message: one sent before that is silently dropped.
  let socket = null;
  let authorized = false;
  const Base = window.WebSocket;
  window.WebSocket = new Proxy(Base, {
    construct(target, args) {
      const ws = Reflect.construct(target, args);
      if (!String(args[0]).includes(SOCKET)) return ws;
      socket = ws;
      authorized = false;
      ws.addEventListener("message", async (event) => {
        let msg;
        try {
          const text = typeof event.data === "string" ? event.data : await event.data.text();
          msg = JSON.parse(text);
        } catch {
          return;
        }
        if (msg?.event?.Cmd === "Authorization" && ws === socket) authorized = true;
        const resolve = waiting.get(msg?.event?.Cid);
        if (resolve) resolve(msg);
      });
      return ws;
    },
  });

  const ready = () => authorized && socket?.readyState === WebSocket.OPEN;

  // Sends one command and resolves with the server's reply, or with
  // { timeout: true } if none comes within `timeout`.
  const request = (cmd, data, timeout) =>
    new Promise((resolve) => {
      const cid = `s${++lastCid}`;
      const timer = setTimeout(() => finish({ timeout: true }), timeout);
      function finish(reply) {
        clearTimeout(timer);
        waiting.delete(cid);
        resolve(reply);
      }
      waiting.set(cid, finish);
      socket.send(new Blob([JSON.stringify({ event: { Cmd: cmd, Cid: cid }, data })]));
    });

  // A request, asked again while coomeet doesn't answer or the connection
  // isn't ready (now and then one goes unanswered; asked again, it's fine).
  const ask = async (cmd, data, { timeout, attempts, retryDelay }) => {
    for (let attempt = 1; ; attempt++) {
      if (ready()) {
        const reply = await request(cmd, data, timeout);
        if (!reply.timeout) return reply;
      }
      if (attempt >= attempts) return null;
      await new Promise((r) => setTimeout(r, retryDelay));
    }
  };

  const cdn = (key) => (typeof key === "string" && /^[\w.-]+$/.test(key) ? CDN + key : null);

  // coomeet sends some names HTML-escaped — "Hazel&lt;3" for what its pages
  // show as "Hazel<3". A <textarea> decodes every kind of escape and never
  // runs anything; a plain "&" or "<" comes through as it is. It's made on
  // first use: this runs before the page has a document to make it in.
  let decoder = null;
  const unescape = (text) => {
    decoder ??= document.createElement("textarea");
    decoder.innerHTML = text;
    return decoder.value;
  };

  // Everything the engine keeps about one model: { id, name, image,
  // deleted, story } — story is { src, storyId } or null — or { id, error }
  // when coomeet didn't answer. Both questions go out together: neither
  // answer depends on the other.
  async function lookup(id, options) {
    const [contact, reply] = await Promise.all([
      ask("GetContact", { id: Number(id) }, options),
      ask("GetAuthorStory", { womanId: Number(id) }, options),
    ]);
    if (!contact) return { id, error: "no answer to GetContact" };
    const info = contact.data?.[String(id)];
    if (!info) return { id, error: `unexpected GetContact reply: ${JSON.stringify(contact).slice(0, 200)}` };
    if (!reply) return { id, error: "no answer to GetAuthorStory" };
    const story = reply.data?.story;

    return {
      id,
      name: typeof info.username === "string" ? unescape(info.username).trim() || null : null,
      image: cdn(info.avatar?.m || info.avatar?.s),
      deleted: Boolean(info.accountDeleted),
      story: story?.media?.webm ? { src: cdn(story.media.webm), storyId: story.id ?? null } : null,
    };
  }

  // Looks up every id, `concurrency` at a time, in the order given.
  async function lookupModels(ids, { concurrency, ...options }) {
    const results = new Array(ids.length);
    let next = 0;
    const worker = async () => {
      while (next < ids.length) {
        const i = next++;
        results[i] = await lookup(ids[i], options);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
    return results;
  }

  window.__cooscrap = { ...window.__cooscrap, socketReady: ready, lookupModels };
})();
