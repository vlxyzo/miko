<!-- header -->

<div align="center">
    <h1><b>miko</b></h1>
    <img src="https://github.com/user-attachments/assets/8d4f98d7-a010-437c-9504-d24668e88138" alt="banner"><br><br>
    <sub>A hyper aesthetic Telegram assistant. Maintained by <a href="https://github.com/vlxyzo">Velix</a></sub>
</div>

---

<!-- badge -->

<div align="center">
    <a href="https://github.com/vlxyzo/miko"><img src="https://img.shields.io/badge/v0.0.1--alpha-black?style=flat&logo=github&logoColor=white&labelColor=000290" alt="rls"/></a>
    <a href="https://github.com/search?q=repo:vlxyzo/miko&language:JavaScript&type=code"><img src="https://img.shields.io/github/languages/top/vlxyzo/miko?label&logo=javascript&logoColor=white&style=flat&labelColor=000290&color=black" alt="js"/></a>
    <a href="https://github.com/vlxyzo/miko/blob/main/LICENSE"><img src="https://img.shields.io/badge/GPL_v3.0-black?style=flat&logo=gnu&logoColor=white&labelColor=000290" alt="lcn"/></a>
<!--
    <a href="https://github.com/vlxyzo/miko/network/members"><img src="https://img.shields.io/github/forks/vlxyzo/miko?label=forks&logo=git&logoColor=white&style=flat&labelColor=black&color=000290" alt="frk"/></a>
    <a href="https://github.com/vlxyzo/miko/watchers"><img src="https://img.shields.io/github/watchers/vlxyzo/miko?label=watchers&logo=clarifai&logoColor=white&style=flat&labelColor=000290&color=black" alt="wtc"/></a>
    <a href="https://github.com/vlxyzo/miko/stargazers/"><img src="https://img.shields.io/github/stars/vlxyzo/miko?label=stars&logo=apachespark&logoColor=white&style=flat&labelColor=000290&color=black" alt="str"/></a>
-->
</div>

---

<!-- caution n warn -->

> [!CAUTION]
> **ALPHA STAGE & OPEN SOURCE LICENSE (DISCLAIMER)**
>
> This project is currently in **Alpha Testing (`v0.0.1-alpha`)**. Expect bugs, unexpected crashes, and breaking changes.
>
> - **Commercial Use/Selling:** You are entirely free to modify, distribute, or sell this project. **HOWEVER**, under the GPL-3.0 rules, any modified or distributed versions _must_ remain open-source and be licensed under the exact same GPL-3.0 license.
> - **Zero Liability:** The [author](https://github.com/vlxyzo) assume **no liability or responsibility** for any account bans, data loss, API downtime, or damages resulting from the use of this software. **USE AT YOUR OWN RISK.**

> [!WARNING]
> **EXTERNAL API RELIANCE & TELEGRAM RISKS**
>
> 1. **Third-Party Endpoints:** This project heavily relies on external web APIs for its core features. If the target API is down, rate-limited, or changes its response structure, the bot _will_ break or throw errors.
> 2. **Unhandled Alpha Bugs:** Because this is an early alpha release, error handling for external API timeouts or invalid JSON responses might not be fully polished yet. Expect the bot to crash if an endpoint acts up.
> 3. **FloodWait & Rate Limits:** Telegram has strict API rate limits. Spamming commands, sending excessive messages, or ignoring `retry-after` headers will trigger `FloodWait` errors or temporary server IP bans.
> 4. **Spam & User Reports:** Using this bot for unsolicited mass broadcasting will lead to user reports. Telegram's anti-spam system will permanently ban bots (and potentially associated accounts) if flagged for abuse.
> 5. **Userbot Risks:** If you run this as a Userbot (logging in with a user phone number via MTProto instead of a BotFather token), the risk of a permanent account ban is significantly higher. Avoid automating high-frequency user actions.

---

<!-- key features -->

<div align="center">
    <h1><b>Key Features</b></h1>
</div>

<table align="center" width="100%">
    <tr>
        <td align="center" width="33%">
            <b>ELITE PERFORMANCE</b><br><br>
            <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/High%20Voltage.png" width="45" alt="speed"/><br><br>
            Node.js 24+ Engine<br>Native ESModules
        </td>
        <td align="center" width="33%">
            <b>AI SUPPORT</b><br><br>
            <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Light%20Bulb.png" width="45" alt="ai"/><br><br>
            Smart Conversational<br>Automated Workflows
        </td>
        <td align="center" width="33%">
            <b>ROBUST STORAGE</b><br><br>
            <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/File%20Folder.png" width="45" alt="data"/><br><br>
            Supabase + Local JSON<br>Hybrid Sync Storage
        </td>
    </tr><tr>
        <td align="center" width="33%">
            <b>MODULAR ARCH</b><br><br>
            <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Gear.png" width="45" alt="gear"/><br><br>
            Auto-Category Plugins<br>Clean and Maintainable
        </td>
        <td align="center" width="33%">
            <b>OMNI FETCH</b><br><br>
            <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Inbox%20Tray.png" width="45" alt="download"/><br><br>
            HD Media Downloader<br>Fast Async Pipeline
        </td>
        <td align="center" width="33%">
            <b>OWNER TOOLS</b><br><br>
            <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Hammer%20and%20Wrench.png" width="45" alt="dev"/><br><br>
            Business Away & Control<br>Full Owner Management
        </td>
    </tr>
</table>

---

<!-- filler -->

<img src="./source/media/image/thumbnail/3.png" alt="img1">

---

<!-- core engine -->
<!--
<div align="center">
    <h1><b>Core Engine</b></h1>
</div>

<table align="center" width="100%">
    <thead>
        <tr>
            <th align="center" width="28%">Module</th>
            <th align="center" width="32%">Entry / Path</th>
            <th align="center" width="40%">Architecture</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td align="center"><b>Process Supervisor</b></td>
            <td align="center"><code>start.js</code></td>
            <td align="center">Auto-restart, crash-loop guard, IPC & scheduled GC</td>
        </tr><tr>
            <td align="center"><b>Bot Engine</b></td>
            <td align="center"><code>script/main.js</code></td>
            <td align="center">Telegraf v4 (Polling & Webhook + Telegram Business)</td>
        </tr><tr>
            <td align="center"><b>Plugin System</b></td>
            <td align="center"><code>script/sys/loader.js</code><br><code>script/sys/handler.js</code></td>
            <td align="center">Folder-based categories, O(1) lookup, cooldown & interactive DYM</td>
        </tr><tr>
            <td align="center"><b>Hybrid Database</b></td>
            <td align="center"><code>script/sys/database.js</code></td>
            <td align="center">In-memory store with atomic JSON backup & Supabase cloud sync</td>
        </tr><tr>
            <td align="center"><b>Media Pipeline</b></td>
            <td align="center"><code>script/lib/ffmpeg.js</code></td>
            <td align="center">Async FFmpeg child-process wrapper for stickers, audio & video</td>
        </tr>
    </tbody>
</table>
---
-->

<!-- requirements -->

<div align="center">
    <h1><b>Requirements</b></h1>
</div>

<table align="center" width="100%">
    <thead>
        <tr>
            <th align="center" width="30%">Dependency</th>
            <th align="center" width="20%">Version</th>
            <th align="center" width="50%">Details</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td align="center"><b>Node.js</b></td>
            <td align="center"><code>&gt;=24.0.0</code></td>
            <td align="center">Core runtime</td>
        </tr><tr>
            <td align="center"><b>npm</b></td>
            <td align="center"><code>&gt;=11.0.0</code></td>
            <td align="center">Default package manager</td>
        </tr><tr>
            <td align="center"><b>Git</b></td>
            <td align="center">any</td>
            <td align="center">Version control and repository updates</td>
        </tr><tr>
            <td align="center"><b>FFmpeg</b></td>
            <td align="center">any</td>
            <td align="center">Required globally for media processing</td>
        </tr><tr>
            <td align="center"><b>PM2</b></td>
            <td align="center">any</td>
            <td align="center">Optional background daemon wrapper</td>
        </tr>
    </tbody>
</table>

---

<!-- documentation -->

<div align="center">
    <h1><b>Explore Docs</b></h1>
</div>

<table width="100%">
    <tr>
        <td width="50%" valign="top">
            <b><a href=".github/docs/custom_l.md">Customization</a></b>
            <br>Change prefixes, names, and core bot behaviors
        </td>
        <td width="50%" valign="top">
            <b><a href=".github/docs/install_l.md">Installation</a></b>
            <br>Deep-dive setup guide and error troubleshooting
        </td>
    </tr><tr>
        <td width="50%" valign="top">
            <b><a href=".github/docs/deploy_l.md">Deployment</a></b>
            <br>Advanced steps for VPS, Heroku, and Pterodactyl
        </td>
        <td width="50%" valign="top">
            <b><a href=".github/docs/path_l.md">Project Structure</a></b>
            <br>A full map of the codebase and directories
        </td>
    </tr><tr>
        <td colspan="2" align="center">
            <b><a href=".github/docs/REPORT.md">Bug Report</a></b>
            <br>Found a glitch? Help me improve by reporting it here
        </td>
    </tr>
</table>

---

<!-- support & community -->

<div align="center">
    <h1><b>Community</b></h1>
    <p>Need help setting up <b>miko</b>, want to request a feature, or just want to hang out? Reach out through the channels below:</p>
    <p>
        <a href="https://t.me/commun002"><img src="https://img.shields.io/badge/002_Community-black?style=flat&logo=telegram&logoColor=white&labelColor=000290" alt="telegram"/></a>
        <a href="https://github.com/vlxyzo/miko/issues"><img src="https://img.shields.io/badge/GitHub_Issues-black?style=flat&logo=github&logoColor=white&labelColor=000290" alt="issues"/></a>
    </p>
</div>

---

<!-- thanks & credits -->

<div align="center">
    <h1><b>Credits</b></h1>
    <p>Huge appreciation to the open-source tools, libraries, and communities that make <b>miko</b> possible:</p>
</div>

<table align="center" width="100%">
    <tr>
        <td align="center" width="25%">
            <b><a href="https://nodejs.org">Node.js</a></b><br>
            <sub>High-speed V8 runtime</sub>
        </td>
        <td align="center" width="25%">
            <b><a href="https://telegraf.js.org">Telegraf</a></b><br>
            <sub>Modern Telegram Bot API framework</sub>
        </td>
        <td align="center" width="25%">
            <b><a href="https://supabase.com">Supabase</a></b><br>
            <sub>Cloud PostgreSQL & real-time sync</sub>
        </td>
        <td align="center" width="25%">
            <b><a href="https://ffmpeg.org">FFmpeg</a></b><br>
            <sub>Multimedia conversion engine</sub>
        </td>
    </tr><tr>
        <td colspan="4" align="center">
            <sub>Special thanks to everyone contributing feedback, bug reports, and stars to <a href="https://github.com/vlxyzo/miko">miko</a>.</sub>
        </td>
    </tr>
</table>

---

<!-- filler 2 -->

<img src="./source/media/image/thumbnail/2.png" alt="img2">

<!-- end -->

<div align="center">
    <sub>Crafted with dedication by <a href="https://github.com/vlxyzo">Velix</a> &bull; Licensed under <a href="https://github.com/vlxyzo/miko/blob/main/LICENSE">GPL-3.0</a></sub>
</div>
