import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TELEGRAM_API = "https://api.telegram.org";
const ADMIN_ID = 5325259001;
const WELCOME = "صبح بخیر! ☀️\n\nبرای پیدا کردن اطلاعات استاد موردنظرت، کافیه اسمش رو برام بفرستی.\n\nمن شماره تلفن و آدرس Gmail استاد رو برات پیدا می‌کنم.\n\n🔎 <b>مثال:</b> فلاحی\n\n⚠️ لطفاً اسم استاد رو دقیق وارد کن؛ جست‌وجو بر اساس تطابق نام انجام می‌شه و ممکنه غلط املایی مثل «فلاهی» به‌جای «فلاحی» یا «فلحی» پیدا نشه.";
const CONTACT_KEYBOARD = { keyboard: [[{ text: "📱 ارسال شماره تلفن خودم", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true };
const REMOVE_KEYBOARD = { remove_keyboard: true };
const ADMIN_KEYBOARD = {
  keyboard: [
    [{ text: "📊 آمار ربات" }, { text: "👥 کاربران اخیر" }],
    [{ text: "🕘 تاریخچه ویرایش‌ها" }, { text: "🔍 جستجوی کاربر" }],
    [{ text: "🏠 منوی کاربر" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

function mainKeyboard(isRegistered: boolean) {
  const keyboard = isRegistered
    ? [
        [{ text: "🔎 جستجوی استاد" }, { text: "✏️ تغییر اطلاعات" }],
        [{ text: "👤 اطلاعات من" }, { text: "ℹ️ راهنما" }],
        [{ text: "🔐 رمز ورود سایت" }],
      ]
    : [
        [{ text: "🔎 جستجوی استاد" }, { text: "📝 ثبت اطلاعات" }],
        [{ text: "ℹ️ راهنما" }],
      ];
  return { keyboard, resize_keyboard: true, is_persistent: true };
}

function html(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function formatDate(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(date);
}
function profileValue(value: unknown): string {
  return html(value === null || value === undefined || value === "" ? "ثبت نشده" : value);
}
function auditValue(data: any): string {
  const labels: Record<string, string> = {
    first_name: "نام", last_name: "نام خانوادگی", phone: "شماره تلفن",
    is_blocked: "وضعیت مسدودی", username: "نام کاربری",
  };
  const entries = Object.entries(data || {});
  if (!entries.length) return "—";
  return entries.map(([key, value]) => {
    const shown = value === null || value === undefined || value === "" ? "ثبت نشده"
      : typeof value === "boolean" ? (value ? "بله" : "خیر") : String(value);
    return "<b>" + html(labels[key] || key) + ":</b> " + html(shown);
  }).join(" | ");
}

async function sendMessage(token: string, chatId: number, text: string, reply_markup?: unknown) {
  const response = await fetch(TELEGRAM_API + "/bot" + token + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(reply_markup ? { reply_markup } : {}) }),
  });
  if (!response.ok) console.error("Telegram sendMessage failed:", response.status, await response.text());
}

async function answerCallbackQuery(token: string, callbackQueryId: string, text?: string, showAlert = false) {
  const response = await fetch(TELEGRAM_API + "/bot" + token + "/answerCallbackQuery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
      ...(showAlert ? { show_alert: true } : {}),
    }),
  });
  if (!response.ok) console.error("Telegram answerCallbackQuery failed:", response.status, await response.text());
}

async function editSelectionMessage(token: string, chatId: number, messageId: number, text: string) {
  const response = await fetch(TELEGRAM_API + "/bot" + token + "/editMessageText", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [] },
    }),
  });
  if (!response.ok) console.error("Telegram editMessageText failed:", response.status, await response.text());
}

function professorMessage(person: any): string {
  const name = String(person.first_name ?? "") + " " + String(person.last_name ?? "");
  return [
    "<b>" + html(name.trim()) + "</b>",
    person.position ? "سمت: " + html(person.position) : "",
    person.department ? "دپارتمان: " + html(person.department) : "",
    person.email ? "ایمیل: " + html(person.email) : "",
    person.phone ? "تلفن: <code>" + html(person.phone) + "</code>" : "",
    person.office ? "اتاق: " + html(person.office) : "",
  ].filter(Boolean).join("\n");
}

async function deleteTelegramMessage(token: string, chatId: number, messageId: number) {
  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/deleteMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
    if (!response.ok) console.warn("Telegram password message deletion failed:", response.status);
  } catch (error) {
    console.warn("Telegram password message deletion failed:", error);
  }
}

function normalizeIranPhone(value: string): string | null {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("0098") && digits.length === 14) return "+" + digits.slice(2);
  if (digits.startsWith("98") && digits.length === 12) return "+" + digits;
  if (digits.startsWith("0") && digits.length === 11) return "+98" + digits.slice(1);
  if (digits.startsWith("9") && digits.length === 10) return "+98" + digits;
  return null;
}

async function authAdminRequest(url: string, key: string, path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${url}/auth/v1/admin/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!response.ok) {
    console.error("Supabase Auth admin request failed:", method, path, response.status, data?.msg || data?.message || "request failed");
    throw new Error("Auth admin request failed");
  }
  return data;
}

async function findAuthUserByPhone(url: string, key: string, phone: string) {
  for (let page = 1; page <= 20; page++) {
    const result = await authAdminRequest(url, key, `users?page=${page}&per_page=1000`);
    const users = Array.isArray(result?.users) ? result.users : [];
    const match = users.find((u: any) => normalizeIranPhone(u.phone || "") === phone);
    if (match) return match;
    if (users.length < 1000) break;
  }
  return null;
}

function websiteLoginEmail(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) throw new Error("INVALID_PROFILE_PHONE");
  return "u" + digits + "@login.marviau.invalid";
}

async function setWebsitePassword(url: string, key: string, profile: any, telegramUserId: number, password: string) {
  const phone = normalizeIranPhone(profile.phone || "");
  if (!phone) throw new Error("INVALID_PROFILE_PHONE");
  const email = websiteLoginEmail(phone);
  let authUserId = profile.website_auth_user_id || null;
  if (!authUserId) {
    const existing = await findAuthUserByPhone(url, key, phone);
    if (existing) {
      const linkedTelegramId = String(existing.user_metadata?.telegram_user_id || "");
      if (linkedTelegramId !== String(telegramUserId)) throw new Error("PHONE_ALREADY_LINKED");
      authUserId = existing.id;
    }
  }
  const metadata = {
    telegram_user_id: String(telegramUserId),
    first_name: profile.first_name || "",
    last_name: profile.last_name || "",
  };
  let result: any;
  if (authUserId) {
    result = await authAdminRequest(url, key, `users/${authUserId}`, "PUT", {
      email, email_confirm: true, password, user_metadata: metadata,
    });
  } else {
    result = await authAdminRequest(url, key, "users", "POST", {
      email, email_confirm: true, password, user_metadata: metadata,
    });
  }
  const authUser = result?.user || result;
  const finalId = authUser?.id || authUserId;
  if (!finalId) throw new Error("AUTH_USER_ID_MISSING");
  await db(url, key, userPath(telegramUserId, "telegram_user_id"), "PATCH", {
    website_auth_user_id: finalId,
    website_password_set_at: new Date().toISOString(),
    registration_step: null,
  }, "return=minimal");
  return phone;
}
async function db(url: string, key: string, path: string, method = "GET", body?: unknown, prefer?: string) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  if (!response.ok) {
    console.error("Database request failed:", method, path, response.status, raw);
    throw new Error("Database request failed");
  }
  return raw ? JSON.parse(raw) : null;
}

async function recordStart(url: string, key: string, updateId: number, user: any): Promise<boolean> {
  const response = await fetch(`${url}/rest/v1/rpc/record_telegram_bot_start`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_telegram_user_id: user.id, p_username: user.username ?? null,
      p_first_name: user.first_name ?? null, p_last_name: user.last_name ?? null,
      p_language_code: user.language_code ?? null, p_update_id: updateId,
    }),
  });
  if (!response.ok) console.error("Could not record /start:", response.status, await response.text());
  return response.ok;
}

async function notifyAdmin(token: string, text: string) {
  try {
    await sendMessage(token, ADMIN_ID, text);
  } catch (error) {
    console.error("Could not send admin notification:", error);
  }
}

function userPath(id: number, select = "*") {
  return `telegram_bot_users?telegram_user_id=eq.${id}&select=${encodeURIComponent(select)}`;
}

const ADMIN_USER_KEYBOARD = {
  keyboard: [
    [{ text: "✏️ ویرایش نام" }, { text: "✏️ ویرایش نام خانوادگی" }],
    [{ text: "📱 ویرایش شماره" }, { text: "🕘 تاریخچه کاربر" }],
    [{ text: "🔎 تاریخچه جست‌وجو" }, { text: "💬 پیام‌های اخیر" }],
    [{ text: "🚫 مسدودسازی" }, { text: "✅ رفع مسدودی" }],
    [{ text: "🔍 جستجوی کاربر دیگر" }, { text: "↩️ پنل مدیریت" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

async function setAdminState(url: string, key: string, adminId: number, state: string | null, targetId?: number | null) {
  const patch: any = { admin_state: state };
  if (targetId !== undefined) patch.admin_target_user_id = targetId;
  await db(url, key, userPath(adminId, "telegram_user_id"), "PATCH", patch, "return=minimal");
}

async function sendAdminUserProfile(token: string, chatId: number, url: string, key: string, targetId: number) {
  const rows = await db(url, key, userPath(targetId));
  if (!rows.length) {
    await sendMessage(token, chatId, "کاربر پیدا نشد.", ADMIN_KEYBOARD);
    return;
  }
  const u = rows[0];
  const name = [u.first_name,u.last_name].filter(Boolean).join(" ") || "ثبت نشده";
  const message = "<b>👤 پروفایل کاربر</b>\n\n" +
    "نام: " + html(name) +
    "\nشماره تلفن: <code>" + profileValue(u.phone) + "</code>" +
    "\nنام کاربری: " + (u.username ? "@" + html(u.username) : "ندارد") +
    "\nشناسه تلگرام: <code>" + u.telegram_user_id + "</code>" +
    "\nتعداد جست‌وجو: " + Number(u.search_count || 0) +
    "\nعضویت: " + formatDate(u.first_seen_at) +
    "\nآخرین فعالیت: " + formatDate(u.last_active_at) +
    "\nوضعیت: " + (u.is_blocked ? "🔴 مسدود" : "🟢 فعال") +
    "\nرشته: " + profileValue(u.major) +
    "\nشماره دانشجویی: " + profileValue(u.student_number);
  await sendMessage(token, chatId, message, ADMIN_USER_KEYBOARD);
}

async function adminCommand(token: string, chatId: number, text: string, url: string, key: string, adminId: number) {
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  const adminRows = await db(url, key, userPath(adminId, "admin_state,admin_target_user_id"));
  const adminState = adminRows[0]?.admin_state as string | null;
  const targetId = Number(adminRows[0]?.admin_target_user_id || 0);

  if (text === "↩️ پنل مدیریت" || cmd === "/admin" || text === "🛠 پنل مدیریت") {
    await setAdminState(url, key, adminId, null, null);
    await sendMessage(token, chatId, "<b>پنل مدیریت</b>\nاز دکمه‌های زیر برای مدیریت ربات استفاده کنید.", ADMIN_KEYBOARD);
    return true;
  }

  if (adminState === "find_user") {
    const term = text.trim().replace(/[(),]/g, " ").slice(0, 80);
    if (!term) {
      await sendMessage(token, chatId, "نام، نام خانوادگی، شماره تلفن یا شناسه تلگرام را بفرستید.");
      return true;
    }
    const rows = /^\d+$/.test(term)
      ? await db(url, key, "telegram_bot_users?select=telegram_user_id,username,first_name,last_name,phone,is_blocked&telegram_user_id=eq." + term + "&limit=10")
      : await db(url, key, "telegram_bot_users?select=telegram_user_id,username,first_name,last_name,phone,is_blocked&or=(first_name.ilike.*" + encodeURIComponent(term) + "*,last_name.ilike.*" + encodeURIComponent(term) + "*,phone.ilike.*" + encodeURIComponent(term) + "*,username.ilike.*" + encodeURIComponent(term) + "*)&order=last_active_at.desc&limit=10");
    if (!rows.length) {
      await sendMessage(token, chatId, "کاربری پیدا نشد. عبارت دیگری بفرستید یا «↩️ پنل مدیریت» را بزنید.");
      return true;
    }
    await setAdminState(url, key, adminId, "select_user");
    const lines = rows.map((u: any) => "• " + html([u.first_name,u.last_name].filter(Boolean).join(" ") || "بدون نام") + " | " + html(u.phone || "بدون شماره") + " | ID: <code>" + u.telegram_user_id + "</code> | " + (u.is_blocked ? "مسدود" : "فعال")).join("\n");
    await sendMessage(token, chatId, "<b>نتایج جست‌وجو</b>\n" + lines + "\n\nبرای بازکردن پروفایل، شناسه عددی کاربر را ارسال کنید.");
    return true;
  }

  if (adminState === "select_user") {
    const id = Number(text.trim());
    if (!Number.isSafeInteger(id) || id <= 0) {
      await sendMessage(token, chatId, "شناسه عددی یکی از کاربران بالا را ارسال کنید.");
      return true;
    }
    await setAdminState(url, key, adminId, null, id);
    await sendAdminUserProfile(token, chatId, url, key, id);
    return true;
  }

  if (text === "🔎 تاریخچه جست‌وجو") {
    if (!targetId) {
      await sendMessage(token, chatId, "ابتدا پروفایل یک کاربر را باز کنید.", ADMIN_KEYBOARD);
      return true;
    }
    const rows = await db(url, key, "telegram_bot_search_history?select=search_term,result_count,searched_at&telegram_user_id=eq." + targetId + "&order=searched_at.desc&limit=20");
    const lines = rows.map((x: any, i: number) =>
      "<b>" + (i + 1) + ". " + html(x.search_term) + "</b> · " +
      Number(x.result_count || 0) + " نتیجه · " + formatDate(x.searched_at)
    ).join("\n");
    await sendMessage(token, chatId, rows.length
      ? "<b>🔎 تاریخچه جست‌وجو</b>\n<code>" + rows.length + " جست‌وجوی آخر</code>\n\n" + lines
      : "برای این کاربر هنوز جست‌وجویی ثبت نشده است.", ADMIN_USER_KEYBOARD);
    return true;
  }

  if (text === "💬 پیام‌های اخیر") {
    if (!targetId) {
      await sendMessage(token, chatId, "ابتدا پروفایل یک کاربر را باز کنید.", ADMIN_KEYBOARD);
      return true;
    }
    const rows = await db(url, key, "telegram_bot_message_history?select=message_type,message_text,sent_at&telegram_user_id=eq." + targetId + "&order=sent_at.desc&limit=20");
    const typeLabels: Record<string, string> = {
      text: "متن", contact: "مخاطب", photo: "عکس", voice: "ویس",
      document: "فایل", sticker: "استیکر", location: "موقعیت مکانی",
      video: "ویدئو", animation: "گیف", audio: "صوت", other: "سایر",
    };
    const lines = rows.map((x: any, i: number) => {
      const body = x.message_text
        ? html(x.message_text.length > 450 ? x.message_text.slice(0, 450) + "…" : x.message_text)
        : x.message_type === "contact" ? "مخاطب ارسال کرد (شماره ذخیره نمی‌شود)" : "محتوای غیرمتنی";
      return "<b>" + (i + 1) + ". " + html(typeLabels[x.message_type] || "پیام") +
        "</b> · <i>" + formatDate(x.sent_at) + "</i>\n" + body;
    }).join("\n\n");
    await sendMessage(token, chatId, rows.length
      ? "<b>💬 پیام‌های اخیر</b>\n<code>" + rows.length + " پیام آخر</code>\n\n" + lines
      : "پیامی از این کاربر ثبت نشده است.", ADMIN_USER_KEYBOARD);
    return true;
  }

  if (["edit_first_name", "edit_last_name", "edit_phone"].includes(adminState || "")) {
    if (!targetId) {
      await setAdminState(url, key, adminId, null, null);
      await sendMessage(token, chatId, "کاربر هدف مشخص نیست؛ دوباره جست‌وجو کنید.", ADMIN_KEYBOARD);
      return true;
    }
    const value = text.trim();
    if (!value || value.length > 120) {
      await sendMessage(token, chatId, "مقدار نامعتبر است. مقدار غیرخالی و حداکثر ۱۲۰ کاراکتری بفرستید.");
      return true;
    }
    const rows = await db(url, key, userPath(targetId));
    if (!rows.length) {
      await setAdminState(url, key, adminId, null, null);
      await sendMessage(token, chatId, "کاربر هدف دیگر پیدا نمی‌شود.", ADMIN_KEYBOARD);
      return true;
    }
    const u = rows[0];
    const field = adminState === "edit_first_name" ? "first_name" : adminState === "edit_last_name" ? "last_name" : "phone";
    const before = { first_name: u.first_name ?? null, last_name: u.last_name ?? null, phone: u.phone ?? null };
    const after = { ...before, [field]: value };
    await db(url, key, userPath(targetId, "telegram_user_id"), "PATCH", { [field]: value }, "return=minimal");
    await db(url, key, "telegram_bot_profile_audit", "POST", {
      telegram_user_id: targetId, changed_by_telegram_user_id: adminId,
      change_source: "admin", before_data: before, after_data: after,
    }, "return=minimal");
    await setAdminState(url, key, adminId, null);
    await sendMessage(token, chatId, "اطلاعات کاربر ویرایش شد و تغییر در تاریخچه ثبت شد.", ADMIN_USER_KEYBOARD);
    await sendAdminUserProfile(token, chatId, url, key, targetId);
    return true;
  }

  if (text === "🔍 جستجوی کاربر" || text === "✏️ ویرایش اطلاعات کاربر" || text === "🔍 جستجوی کاربر دیگر") {
    await setAdminState(url, key, adminId, "find_user", null);
    await sendMessage(token, chatId, "نام، نام خانوادگی، شماره تلفن یا شناسه تلگرام کاربر را بفرستید.\nبرای بازگشت، «↩️ پنل مدیریت» را بزنید.");
    return true;
  }

  if (["✏️ ویرایش نام", "✏️ ویرایش نام خانوادگی", "📱 ویرایش شماره"].includes(text)) {
    if (!targetId) {
      await sendMessage(token, chatId, "ابتدا یک کاربر را جست‌وجو و پروفایلش را باز کنید.", ADMIN_KEYBOARD);
      return true;
    }
    const state = text === "✏️ ویرایش نام" ? "edit_first_name" : text === "✏️ ویرایش نام خانوادگی" ? "edit_last_name" : "edit_phone";
    await setAdminState(url, key, adminId, state);
    await sendMessage(token, chatId, text === "✏️ ویرایش نام" ? "نام جدید کاربر را بفرستید:" : text === "✏️ ویرایش نام خانوادگی" ? "نام خانوادگی جدید کاربر را بفرستید:" : "شماره تلفن جدید را بفرستید:");
    return true;
  }

  if (text === "🚫 مسدودسازی" || text === "✅ رفع مسدودی") {
    if (!targetId) {
      await sendMessage(token, chatId, "ابتدا پروفایل یک کاربر را باز کنید.", ADMIN_KEYBOARD);
      return true;
    }
    const rows = await db(url, key, userPath(targetId));
    if (!rows.length) {
      await sendMessage(token, chatId, "کاربر پیدا نشد.", ADMIN_KEYBOARD);
      return true;
    }
    const blocked = text === "🚫 مسدودسازی";
    const u = rows[0];
    await db(url, key, userPath(targetId, "telegram_user_id"), "PATCH",
      blocked ? { is_blocked: true, blocked_at: new Date().toISOString() } : { is_blocked: false, blocked_at: null, block_reason: null },
      "return=minimal");
    await db(url, key, "telegram_bot_profile_audit", "POST", {
      telegram_user_id: targetId, changed_by_telegram_user_id: adminId,
      change_source: blocked ? "admin_block" : "admin_unblock",
      before_data: { is_blocked: Boolean(u.is_blocked) },
      after_data: { is_blocked: blocked },
    }, "return=minimal");
    await sendMessage(token, chatId, blocked ? "کاربر مسدود شد." : "مسدودی کاربر برداشته شد.", ADMIN_USER_KEYBOARD);
    await sendAdminUserProfile(token, chatId, url, key, targetId);
    return true;
  }

  if (text === "🕘 تاریخچه کاربر") {
    if (!targetId) {
      await sendMessage(token, chatId, "ابتدا پروفایل یک کاربر را باز کنید.", ADMIN_KEYBOARD);
      return true;
    }
    const rows = await db(url, key, "telegram_bot_profile_audit?select=changed_by_telegram_user_id,change_source,before_data,after_data,changed_at&telegram_user_id=eq." + targetId + "&order=changed_at.desc&limit=10");
    const lines = rows.map((x: any, i: number) => {
      const actor = x.change_source === "user" ? "خود کاربر"
        : x.changed_by_telegram_user_id ? "ادمین · " + x.changed_by_telegram_user_id : "سیستم";
      return "<b>" + (i + 1) + ". " + html(x.change_source === "user" ? "ثبت توسط کاربر" : "ویرایش مدیریتی") +
        "</b> · " + formatDate(x.changed_at) +
        "\n<b>انجام‌دهنده:</b> " + html(actor) +
        "\n<b>قبل:</b> " + auditValue(x.before_data) +
        "\n<b>بعد:</b> " + auditValue(x.after_data);
    }).join("\n\n");
    await sendMessage(token, chatId, rows.length
      ? "<b>🕘 تاریخچه تغییرات</b>\n\n" + lines
      : "برای این کاربر سابقه تغییری ثبت نشده است.", ADMIN_USER_KEYBOARD);
    return true;
  }

  if (cmd === "/stats" || text === "📊 آمار ربات") {
    const rows = await db(url, key, "telegram_bot_users?select=is_registered,is_blocked,search_count,first_seen_at,last_active_at");
    const total = rows.length;
    const registered = rows.filter((x: any) => x.is_registered).length;
    const blocked = rows.filter((x: any) => x.is_blocked).length;
    const searches = rows.reduce((n: number, x: any) => n + Number(x.search_count || 0), 0);
    const today = new Date(); today.setUTCHours(0,0,0,0);
    const newToday = rows.filter((x: any) => new Date(x.first_seen_at) >= today).length;
    await sendMessage(token, chatId, "<b>آمار ربات</b>\nکل کاربران: " + total + "\nثبت‌نام‌شده: " + registered + "\nثبت‌نام‌نشده: " + (total-registered) + "\nمسدودشده: " + blocked + "\nکاربران جدید امروز: " + newToday + "\nمجموع جست‌وجوها: " + searches, ADMIN_KEYBOARD);
    return true;
  }

  if (cmd === "/users" || text === "👥 کاربران اخیر") {
    const offset = Math.max(0, Math.min(10000, Number(args[0] || 0)));
    const rows = await db(url, key, "telegram_bot_users?select=telegram_user_id,username,first_name,last_name,phone,is_registered,is_blocked,search_count,last_active_at&order=last_active_at.desc&limit=20&offset=" + offset);
    const lines = rows.map((u: any, i: number) => (offset+i+1) + ". " + html([u.first_name,u.last_name].filter(Boolean).join(" ") || u.telegram_user_id) + " | " + (u.is_registered ? "ثبت‌نام‌شده" : "ثبت‌نام‌نشده") + " | جست‌وجو: " + u.search_count + " | " + (u.is_blocked ? "مسدود" : "فعال") + "\nID: <code>" + u.telegram_user_id + "</code> | " + html(u.username ? "@"+u.username : "بدون username") + " | " + html(u.phone || "بدون شماره")).join("\n\n");
    await sendMessage(token, chatId, rows.length ? "<b>کاربران " + (offset+1) + " تا " + (offset+rows.length) + "</b>\n\n" + lines + "\n\nصفحه بعد: /users " + (offset+20) : "کاربری در این صفحه وجود ندارد.", ADMIN_KEYBOARD);
    return true;
  }

  if (cmd === "/changes" || text === "🕘 تاریخچه ویرایش‌ها") {
    const rows = await db(url, key, "telegram_bot_profile_audit?select=telegram_user_id,changed_by_telegram_user_id,change_source,before_data,after_data,changed_at&order=changed_at.desc&limit=12");
    const lines = rows.map((x: any) => {
      const before = x.before_data || {};
      const after = x.after_data || {};
      const fmt = (v: any) => "نام: " + html(v.first_name || "—") + " " + html(v.last_name || "") + " | تلفن: " + html(v.phone || "—");
      return "کاربر: <code>" + x.telegram_user_id + "</code> | " + html(x.change_source) + "\nقبل: " + fmt(before) + "\nبعد: " + fmt(after) + "\nزمان: " + html(x.changed_at);
    }).join("\n\n");
    await sendMessage(token, chatId, rows.length ? "<b>۱۲ تغییر اخیر اطلاعات کاربران</b>\n\n" + lines : "هنوز تغییری ثبت نشده است.", ADMIN_KEYBOARD);
    return true;
  }

  if (cmd === "/find" && args.length) {
    const term = args.join(" ").replace(/[(),]/g, " ").trim().slice(0, 80);
    const q = encodeURIComponent(term);
    const rows = await db(url, key, "telegram_bot_users?select=telegram_user_id,username,first_name,last_name,phone,is_registered,is_blocked,search_count&or=(first_name.ilike.*" + q + "*,last_name.ilike.*" + q + "*,phone.ilike.*" + q + "*,username.ilike.*" + q + "*)&order=last_active_at.desc&limit=20");
    const lines = rows.map((u: any) => html([u.first_name,u.last_name].filter(Boolean).join(" ") || "بدون نام") + " | " + html(u.phone || "بدون شماره") + " | ID: <code>" + u.telegram_user_id + "</code> | " + html(u.username || "")).join("\n");
    await sendMessage(token, chatId, rows.length ? "<b>نتایج جست‌وجوی کاربران</b>\n" + lines : "کاربری پیدا نشد.", ADMIN_KEYBOARD);
    return true;
  }

  if (cmd === "/history" && args[0]) {
    const id = Number(args[0]);
    const rows = await db(url, key, "telegram_bot_search_history?select=search_term,result_count,searched_at&telegram_user_id=eq." + id + "&order=searched_at.desc&limit=30");
    const lines = rows.map((x: any) => "• " + html(x.search_term) + " — " + x.result_count + " نتیجه — " + html(x.searched_at)).join("\n");
    await sendMessage(token, chatId, rows.length ? "<b>۳۰ جست‌وجوی اخیر کاربر</b>\n" + lines : "تاریخچه‌ای برای این کاربر ثبت نشده.", ADMIN_KEYBOARD);
    return true;
  }

  if (cmd === "/user" && args[0]) {
    const id = Number(args[0]);
    if (!Number.isSafeInteger(id) || id <= 0) {
      await sendMessage(token, chatId, "شناسه نامعتبر است.", ADMIN_KEYBOARD);
      return true;
    }
    await setAdminState(url, key, adminId, null, id);
    await sendAdminUserProfile(token, chatId, url, key, id);
    return true;
  }

  if ((cmd === "/block" || cmd === "/unblock") && args[0]) {
    const id = Number(args[0]);
    if (!Number.isSafeInteger(id)) {
      await sendMessage(token, chatId, "شناسه نامعتبر است.", ADMIN_KEYBOARD);
      return true;
    }
    const rows = await db(url, key, userPath(id));
    if (!rows.length) {
      await sendMessage(token, chatId, "کاربر پیدا نشد.", ADMIN_KEYBOARD);
      return true;
    }
    await db(url, key, userPath(id, "telegram_user_id"), "PATCH",
      cmd === "/block" ? { is_blocked: true, blocked_at: new Date().toISOString() } : { is_blocked: false, blocked_at: null, block_reason: null },
      "return=minimal");
    await db(url, key, "telegram_bot_profile_audit", "POST", {
      telegram_user_id: id, changed_by_telegram_user_id: adminId,
      change_source: cmd === "/block" ? "admin_block" : "admin_unblock",
      before_data: { is_blocked: Boolean(rows[0].is_blocked) },
      after_data: { is_blocked: cmd === "/block" },
    }, "return=minimal");
    await sendMessage(token, chatId, cmd === "/block" ? "کاربر مسدود شد." : "رفع مسدودی انجام شد.", ADMIN_KEYBOARD);
    return true;
  }
  return false;
}
// Telegram webhook settings are refreshed periodically to ensure button callbacks are delivered.
let webhookConfigLastChecked = 0;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Telegram professor directory bot", { status: 200 });
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!botToken || !supabaseUrl || !anonKey || !serviceKey) return new Response("Server is not configured", { status: 500 });

  let update: any;
  try { update = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }

  // Inline professor selection callbacks are handled separately from text messages.
  const callback = update?.callback_query;
  if (callback) {
    const callbackChatId = callback.message?.chat?.id;
    const callbackUserId = Number(callback.from?.id);
    const callbackData = String(callback.data ?? "");
    const match = callbackData.match(/^prof:([0-9a-f-]{36}):(\d{1,20})$/i);

    if (!match || !callbackChatId || !Number.isSafeInteger(callbackUserId)) {
      await answerCallbackQuery(botToken, String(callback.id), "این دکمه معتبر نیست.", true);
      return new Response("OK");
    }
    if (Number(match[2]) !== callbackUserId) {
      await answerCallbackQuery(botToken, String(callback.id), "این نتایج متعلق به جست‌وجوی کاربر دیگری است.", true);
      return new Response("OK");
    }

    await answerCallbackQuery(botToken, String(callback.id), "در حال دریافت اطلاعات استاد...");
    try {
      const userRows = await db(supabaseUrl, serviceKey, userPath(callbackUserId));
      const selectedRows = await db(
        supabaseUrl,
        serviceKey,
        "people?id=eq." + encodeURIComponent(match[1]) +
          "&select=id,first_name,last_name,position,phone,email,department,office&limit=1",
      );
      const selected = Array.isArray(selectedRows) ? selectedRows[0] : null;
      const keyboard = callbackUserId === ADMIN_ID
        ? ADMIN_KEYBOARD
        : mainKeyboard(Boolean(userRows[0]?.is_registered));

      if (!selected) {
        await editSelectionMessage(botToken, callbackChatId, Number(callback.message.message_id), "این استاد دیگر در فهرست اطلاعات موجود نیست.");
        await sendMessage(botToken, callbackChatId, "لطفاً دوباره جست‌وجو کنید.", keyboard);
        return new Response("OK");
      }

      const selectedName = String(selected.first_name ?? "") + " " + String(selected.last_name ?? "");
      await editSelectionMessage(
        botToken,
        callbackChatId,
        Number(callback.message.message_id),
        "استاد انتخاب‌شده: <b>" + html(selectedName.trim()) + "</b>",
      );
      await sendMessage(botToken, callbackChatId, professorMessage(selected), keyboard);
    } catch (error) {
      console.error("Professor selection callback failed:", error);
      await sendMessage(
        botToken,
        callbackChatId,
        "در دریافت اطلاعات استاد مشکلی پیش اومد. لطفاً دوباره جست‌وجو کنید.",
        callbackUserId === ADMIN_ID ? ADMIN_KEYBOARD : mainKeyboard(false),
      );
    }
    return new Response("OK");
  }

  // Ensure Telegram forwards inline-button callback_query updates as well as messages.
  const webhookSecretForSetup = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  const webhookHeaderSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (
    update?.message &&
    Date.now() - webhookConfigLastChecked > 6 * 60 * 60 * 1000 &&
    (!webhookSecretForSetup || webhookHeaderSecret === webhookSecretForSetup)
  ) {
    try {
      const webhookUrl = supabaseUrl.replace(/\/+$/, "") + "/functions/v1/telegram-professors-bot";
      const setupResponse = await fetch(TELEGRAM_API + "/bot" + botToken + "/setWebhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ["message", "callback_query"],
          drop_pending_updates: false,
          ...(webhookSecretForSetup ? { secret_token: webhookSecretForSetup } : {}),
        }),
      });
      const setupResult = await setupResponse.json();
      if (setupResponse.ok && setupResult?.ok) {
        webhookConfigLastChecked = Date.now();
        console.log("Telegram webhook configured for message and callback_query updates.");
      } else {
        console.error("Telegram webhook configuration failed:", setupResult);
      }
    } catch (webhookError) {
      console.error("Telegram webhook configuration request failed:", webhookError);
    }
  }

  const message = update?.message;
  const chatId = message?.chat?.id;
  const user = message?.from;
  if (!chatId || !user?.id) return new Response("OK");

  const userId = Number(user.id);
  const text = typeof message.text === "string" ? message.text.trim() : "";
  const contact = message.contact;

  try {
    await db(supabaseUrl, serviceKey, "telegram_bot_users?on_conflict=telegram_user_id", "POST", {
      telegram_user_id: userId, username: user.username ?? null,
      telegram_first_name: user.first_name ?? null, telegram_last_name: user.last_name ?? null,
      last_active_at: new Date().toISOString(),
    }, "resolution=merge-duplicates,return=minimal");

    const users = await db(supabaseUrl, serviceKey, userPath(userId));
    let profile = users[0];

    // Password messages are never written to message history.
    const isWebsitePasswordMessage = profile.registration_step === "website_password" && Boolean(text);
    if (isWebsitePasswordMessage && Number.isSafeInteger(Number(message.message_id))) {
      await deleteTelegramMessage(botToken, chatId, Number(message.message_id));
    }
    // Record incoming user messages; never persist contact payloads, phone numbers, or passwords.
    if (!isWebsitePasswordMessage && userId !== ADMIN_ID && Number.isSafeInteger(Number(message.message_id))) {
      const messageType = message.contact ? "contact"
        : message.photo ? "photo"
        : message.voice ? "voice"
        : message.document ? "document"
        : message.sticker ? "sticker"
        : message.location ? "location"
        : message.video ? "video"
        : message.animation ? "animation"
        : message.audio ? "audio"
        : text ? "text" : "other";
      try {
        await db(supabaseUrl, serviceKey, "telegram_bot_message_history?on_conflict=telegram_user_id,telegram_message_id", "POST", {
          telegram_user_id: userId,
          telegram_message_id: Number(message.message_id),
          message_type: messageType,
          message_text: text ? text.slice(0, 4000) : null,
        }, "resolution=ignore-duplicates,return=minimal");
      } catch (logError) {
        console.error("Could not record incoming message:", logError);
      }
    }

    const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
    const verifiedWebhook = Boolean(webhookSecret && req.headers.get("x-telegram-bot-api-secret-token") === webhookSecret);
    if (userId === ADMIN_ID && verifiedWebhook) {
      if (text === "🏠 منوی کاربر") {
        await sendMessage(botToken, chatId, WELCOME, mainKeyboard(profile.is_registered));
        return new Response("OK");
      }
      if (await adminCommand(botToken, chatId, text, supabaseUrl, serviceKey, userId)) return new Response("OK");
    }

    if (profile.is_blocked && userId !== ADMIN_ID) {
      await sendMessage(botToken, chatId, "دسترسی شما به این ربات مسدود شده است.");
      return new Response("OK");
    }

    if (text === "🔎 جستجوی استاد") {
      // Starting a search cancels any unfinished registration flow.
      await db(supabaseUrl, serviceKey, userPath(userId, "telegram_user_id"), "PATCH", {
        registration_step: null,
        draft_first_name: null,
        draft_last_name: null,
        draft_major: null,
        draft_student_number: null,
        draft_phone: null,
      }, "return=minimal");
      profile.registration_step = null;
      await sendMessage(botToken, chatId, "نام یا نام خانوادگی استاد رو بفرستید تا جست‌وجو کنم.", mainKeyboard(profile.is_registered));
      return new Response("OK");
    }
    if (text === "✏️ تغییر اطلاعات" || text === "📝 ثبت اطلاعات" || text === "/register" || text === "/edit") {
      await db(supabaseUrl, serviceKey, userPath(userId, "telegram_user_id"), "PATCH", { registration_step: "first_name", draft_first_name: null, draft_last_name: null, draft_major: null, draft_student_number: null, draft_phone: null }, "return=minimal");
      await sendMessage(botToken, chatId, "لطفاً نام خودتون رو وارد کنید:", REMOVE_KEYBOARD);
      return new Response("OK");
    }
    if (text === "🔐 رمز ورود سایت") {
      if (!profile.is_registered || !profile.phone) {
        await sendMessage(botToken, chatId, "برای ساخت رمز سایت، ابتدا ثبت‌نام ربات رو کامل کنید و شماره تلفن خودتون رو ثبت کنید.", mainKeyboard(profile.is_registered));
        return new Response("OK");
      }
      await db(supabaseUrl, serviceKey, userPath(userId, "telegram_user_id"), "PATCH", { registration_step: "website_password" }, "return=minimal");
      profile.registration_step = "website_password";
      await sendMessage(botToken, chatId, "🔐 <b>ساخت رمز ورود سایت</b>\n\nیک رمز عبور حداقل ۸ کاراکتری بفرستید.\n\nپیام رمز بعد از دریافت از تاریخچه ربات حذف می‌شه و در دیتابیس هم به‌صورت متن ساده ذخیره نمی‌شه.\n\nبرای انصراف، «لغو» رو بفرستید.", REMOVE_KEYBOARD);
      return new Response("OK");
    }
    if (profile.registration_step === "website_password" && text) {
      if (/^(لغو|cancel)$/i.test(text)) {
        await db(supabaseUrl, serviceKey, userPath(userId, "telegram_user_id"), "PATCH", { registration_step: null }, "return=minimal");
        await sendMessage(botToken, chatId, "ساخت رمز لغو شد.", mainKeyboard(profile.is_registered));
        return new Response("OK");
      }
      const passwordBytes = new TextEncoder().encode(text).length;
      if (text.length < 8 || passwordBytes > 72) {
        await sendMessage(botToken, chatId, "رمز باید حداقل ۸ کاراکتر و حداکثر ۷۲ بایت باشد. دوباره رمز رو بفرستید یا «لغو» کنید.");
        return new Response("OK");
      }
      try {
        const phone = await setWebsitePassword(supabaseUrl, serviceKey, profile, userId, text);
        profile.registration_step = null;
        await sendMessage(botToken, chatId, "✅ رمز ورود سایت با موفقیت ثبت شد.\n\nاز این به بعد می‌تونید با شماره تلفن " + html(phone) + " و همین رمز وارد سایت بشید.", mainKeyboard(true));
      } catch (error) {
        console.error("Website password setup failed:", error);
        await sendMessage(botToken, chatId, "فعلاً ساخت رمز انجام نشد. لطفاً کمی بعد دوباره تلاش کنید؛ اگر شماره ثبت‌شده‌تون تغییر کرده، ابتدا اطلاعات ربات رو اصلاح کنید.");
      }
      return new Response("OK");
    }
    if (text === "👤 اطلاعات من") {
      const current = await db(supabaseUrl, serviceKey, userPath(userId, "first_name,last_name,phone,is_registered,search_count"));
      const u = current[0] ?? {};
      await sendMessage(botToken, chatId, `<b>اطلاعات ثبت‌شده شما</b>\nنام: ${html(u.first_name || "ثبت نشده")}\nنام خانوادگی: ${html(u.last_name || "ثبت نشده")}\nشماره تلفن: ${html(u.phone || "ثبت نشده")}\nوضعیت ثبت‌نام: ${u.is_registered ? "تکمیل‌شده" : "تکمیل‌نشده"}\nتعداد جست‌وجو: ${Number(u.search_count || 0)}`, mainKeyboard(profile.is_registered));
      return new Response("OK");
    }
    if (text === "ℹ️ راهنما" || text === "/help") {
      await sendMessage(botToken, chatId, "برای جست‌وجو، نام یا نام خانوادگی استاد رو ارسال کنید.\nبرای ویرایش مشخصات، دکمه «تغییر اطلاعات» رو بزنید.", mainKeyboard(profile.is_registered));
      return new Response("OK");
    }

    if (text === "/start" || text.startsWith("/start ")) {
      // /start always exits any unfinished registration flow so stale state
      // cannot consume the next message intended as a professor search.
      if (profile.registration_step) {
        await db(supabaseUrl, serviceKey, userPath(userId, "telegram_user_id"), "PATCH", {
          registration_step: null,
          draft_first_name: null,
          draft_last_name: null,
          draft_major: null,
          draft_student_number: null,
          draft_phone: null,
        }, "return=minimal");
        profile.registration_step = null;
      }
      if (Number.isInteger(update.update_id)) {
        let isFirstStart = false;
        try {
          const priorStarts = await db(supabaseUrl, serviceKey,
            `telegram_bot_start_events?telegram_user_id=eq.${userId}&select=telegram_user_id&limit=1`);
          isFirstStart = Array.isArray(priorStarts) && priorStarts.length === 0;
        } catch (error) {
          console.error("Could not check prior /start events:", error);
        }
        const recorded = await recordStart(supabaseUrl, serviceKey, update.update_id, user);
        if (isFirstStart && recorded) {
          const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ") || "نامشخص";
          const username = user.username ? "@" + html(user.username) : "ندارد";
          await notifyAdmin(botToken,
            `🆕 <b>ورود کاربر جدید به ربات</b>\n\n<b>نام تلگرامی:</b> ${html(displayName)}\n<b>نام کاربری:</b> ${username}\n<b>شناسه تلگرام:</b> <code>${userId}</code>\n<b>زمان ورود:</b> ${formatDate(new Date().toISOString())}`);
        }
      }
      const startPayload = text.split(/\\s+/, 2)[1] || "";
      if (startPayload === "website_password") {
        if (profile.is_registered && profile.phone) {
          await db(supabaseUrl, serviceKey, userPath(userId, "telegram_user_id"), "PATCH", { registration_step: "website_password" }, "return=minimal");
          profile.registration_step = "website_password";
          await sendMessage(botToken, chatId, "🔐 <b>ساخت رمز ورود سایت</b>\n\nیک رمز عبور حداقل ۸ کاراکتری بفرستید.\n\nپیام رمز بعد از دریافت از تاریخچه ربات حذف می‌شه و در دیتابیس هم به‌صورت متن ساده ذخیره نمی‌شه.\n\nبرای انصراف، «لغو» رو بفرستید.", REMOVE_KEYBOARD);
        } else {
          await sendMessage(botToken, chatId, "برای ساخت رمز سایت، ابتدا ثبت‌نام ربات رو کامل کنید.", mainKeyboard(false));
        }
        return new Response("OK");
      }
      await sendMessage(botToken, chatId, WELCOME, userId === ADMIN_ID ? ADMIN_KEYBOARD : mainKeyboard(profile.is_registered));
      return new Response("OK");
    }
    if (text === "/help") {
      await sendMessage(botToken, chatId, "برای جست‌وجو، نام یا نام خانوادگی استاد را بدون دستور / ارسال کنید.\nبرای ثبت اطلاعات شخصی، پس از دو جست‌وجوی اول راهنمایی‌تان می‌کنم.");
      return new Response("OK");
    }

    if (text === "/register" || text === "/edit") {
      await db(supabaseUrl, serviceKey, userPath(userId, "telegram_user_id"), "PATCH", { registration_step: "first_name", draft_first_name: null, draft_last_name: null, draft_major: null, draft_student_number: null, draft_phone: null }, "return=minimal");
      await sendMessage(botToken, chatId, "لطفاً نام خودتون رو وارد کنید:");
      return new Response("OK");
    }

    if (contact) {
      if (Number(contact.user_id) !== userId) {
        await sendMessage(botToken, chatId, "این شماره متعلق به حساب تلگرام شما نیست. لطفاً از دکمه «ارسال شماره تلفن خودم» استفاده کنید.", CONTACT_KEYBOARD);
        return new Response("OK");
      }
      if (profile.registration_step !== "contact") {
        await sendMessage(botToken, chatId, "برای ثبت شماره، ابتدا نام و نام خانوادگی رو وارد کنید. از دکمه «ثبت اطلاعات» استفاده کنید.", mainKeyboard(profile.is_registered));
        return new Response("OK");
      }
      const wasRegistered = Boolean(profile.is_registered);
      const registrationTime = new Date().toISOString();
      const beforeProfile = { first_name: profile.first_name ?? null, last_name: profile.last_name ?? null, phone: profile.phone ?? null };
      const afterProfile = { first_name: profile.draft_first_name, last_name: profile.draft_last_name, phone: contact.phone_number };
      await db(supabaseUrl, serviceKey, userPath(userId, "telegram_user_id"), "PATCH", {
        first_name: profile.draft_first_name,
        last_name: profile.draft_last_name,
        phone: contact.phone_number,
        is_registered: true,
        registered_at: registrationTime,
        registration_step: null,
        draft_first_name: null,
        draft_last_name: null,
        draft_major: null,
        draft_student_number: null,
        draft_phone: null,
      }, "return=minimal");
      await db(supabaseUrl, serviceKey, "telegram_bot_profile_audit", "POST", {
        telegram_user_id: userId, changed_by_telegram_user_id: userId,
        change_source: "user", before_data: beforeProfile, after_data: afterProfile,
      }, "return=minimal");
      if (!wasRegistered) {
        await notifyAdmin(botToken,
          `📝 <b>ثبت‌نام کاربر تکمیل شد</b>\n\n<b>نام و نام خانوادگی:</b> ${html(afterProfile.first_name)} ${html(afterProfile.last_name)}\n<b>شماره تلفن:</b> <code>${html(afterProfile.phone)}</code>\n<b>شناسه تلگرام:</b> <code>${userId}</code>\n<b>زمان ثبت‌نام:</b> ${formatDate(registrationTime)}`);
      }
      await sendMessage(botToken, chatId, "اطلاعات شما با موفقیت ثبت شد. ثبت‌نام به پایان رسید و می‌تونید از ربات استفاده کنید.\n\nهر زمان خواستید، از دکمه «رمز ورود سایت» برای ساخت رمز اختیاری حساب سایت استفاده کنید.", mainKeyboard(true));
      return new Response("OK");
    }

    if (profile.registration_step === "confirm") {
      if (/^(تأیید|تایید|بله|yes)$/i.test(text)) {
        const wasRegistered = Boolean(profile.is_registered);
        const registrationTime = new Date().toISOString();
        await db(supabaseUrl, serviceKey, userPath(userId, "telegram_user_id"), "PATCH", {
          first_name: profile.draft_first_name, last_name: profile.draft_last_name,
          phone: profile.draft_phone, major: profile.draft_major, student_number: profile.draft_student_number,
          is_registered: true, registered_at: new Date().toISOString(),
          registration_step: null, draft_first_name: null, draft_last_name: null, draft_major: null, draft_student_number: null, draft_phone: null,
        }, "return=minimal");
        if (!wasRegistered) {
          await notifyAdmin(botToken,
            `📝 <b>ثبت‌نام کاربر تکمیل شد</b>\n\n<b>نام و نام خانوادگی:</b> ${html(profile.draft_first_name)} ${html(profile.draft_last_name)}\n<b>شماره تلفن:</b> <code>${html(profile.draft_phone)}</code>\n<b>شناسه تلگرام:</b> <code>${userId}</code>\n<b>زمان ثبت‌نام:</b> ${formatDate(registrationTime)}`);
        }
        await sendMessage(botToken, chatId, "ثبت اطلاعات با موفقیت انجام شد. از این به بعد می‌تونید از جست‌وجوی ربات استفاده کنید.", mainKeyboard(true));
      } else if (/^(لغو|cancel|خیر|نه)$/i.test(text)) {
        await db(supabaseUrl, serviceKey, userPath(userId, "telegram_user_id"), "PATCH", { registration_step: "first_name", draft_first_name: null, draft_last_name: null, draft_major: null, draft_student_number: null, draft_phone: null }, "return=minimal");
        await sendMessage(botToken, chatId, "ثبت اطلاعات لغو شد. لطفاً نام خودتون رو وارد کنید:");
      } else {
        await sendMessage(botToken, chatId, "لطفاً برای ثبت اطلاعات «تأیید» یا برای لغو «لغو» رو بفرستید.");
      }
      return new Response("OK");
    }

    if (profile.registration_step === "first_name" && text) {
      await db(supabaseUrl, serviceKey, userPath(userId, "telegram_user_id"), "PATCH", { draft_first_name: text.trim().slice(0, 80), registration_step: "last_name" }, "return=minimal");
      await sendMessage(botToken, chatId, "حالا نام خانوادگی خودتون رو وارد کنید:");
      return new Response("OK");
    }
    if (profile.registration_step === "last_name" && text) {
      await db(supabaseUrl, serviceKey, userPath(userId, "telegram_user_id"), "PATCH", { draft_last_name: text.trim().slice(0, 80), registration_step: "contact" }, "return=minimal");
      await sendMessage(botToken, chatId, "حالا شماره تلفن خودتون رو با دکمه زیر ارسال کنید:", CONTACT_KEYBOARD);
      return new Response("OK");
    }
    if (profile.registration_step === "major" && text) {
      await db(supabaseUrl, serviceKey, userPath(userId, "telegram_user_id"), "PATCH", { draft_major: /^(رد|ندارم|-)$/i.test(text) ? null : text.slice(0, 100), registration_step: "student_number" }, "return=minimal");
      await sendMessage(botToken, chatId, "شماره دانشجویی‌تون رو وارد کنید؛ در صورت تمایل نداشتن، «رد» رو بفرستید:");
      return new Response("OK");
    }
    if (profile.registration_step === "student_number" && text) {
      await db(supabaseUrl, serviceKey, userPath(userId, "telegram_user_id"), "PATCH", { draft_student_number: /^(رد|ندارم|-)$/i.test(text) ? null : text.slice(0, 40), registration_step: "contact" }, "return=minimal");
      await sendMessage(botToken, chatId, "حالا شماره تلفن خودتون رو با دکمه زیر ارسال کنید. شماره تایپ‌شده یا مخاطب شخص دیگر پذیرفته نمی‌شه.", CONTACT_KEYBOARD);
      return new Response("OK");
    }
    if (profile.registration_step === "contact") {
      await sendMessage(botToken, chatId, "برای ادامه، شماره خودتون رو فقط با دکمه زیر ارسال کنید.", CONTACT_KEYBOARD);
      return new Response("OK");
    }

    if (text.startsWith("/")) {
      await sendMessage(botToken, chatId, "برای جست‌وجو، نام یا نام خانوادگی استاد را بدون دستور / ارسال کنید.");
      return new Response("OK");
    }

    if (!text) return new Response("OK");
    if (!profile.is_registered && Number(profile.search_count) >= 2) {
      await db(supabaseUrl, serviceKey, userPath(userId, "telegram_user_id"), "PATCH", { registration_step: "first_name" }, "return=minimal");
      await sendMessage(botToken, chatId, "🔒 برای ادامه استفاده از ربات، یک ثبت‌نام کوتاه لازمه.\n\nبرای جلوگیری از اسپم، سوءاستفاده و جست‌وجوهای غیرواقعی، استفاده از امکانات بیشتر ربات به ثبت اطلاعات کاربر نیاز داره.\n\nاین کار کمک می‌کنه دسترسی ربات برای کاربران واقعی حفظ بشه.\n\n📝 ثبت‌نام فقط یک‌بار انجام می‌شه و بعد از اون می‌تونی بدون محدودیت جست‌وجو کنی.\n\nبریم ثبت‌نام رو کامل کنیم؟\n\nلطفاً نام خودت رو وارد کن:");
      return new Response("OK");
    }

    const term = text.replace(/[^\p{L}\p{N} _-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    if (term.length < 2) {
      await sendMessage(botToken, chatId, "لطفاً حداقل دو حرف از نام استاد را وارد کنید.");
      return new Response("OK");
    }

    const nameParts = term.split(" ").filter(Boolean);
    const nameFilters = nameParts.length >= 2
      ? nameParts.flatMap((part, index) => nameParts.slice(index + 1).flatMap((other) => [
          `and(first_name.ilike.*${part}*,last_name.ilike.*${other}*)`,
          `and(first_name.ilike.*${other}*,last_name.ilike.*${part}*)`,
        ]))
      : [`first_name.ilike.*${term}*`, `last_name.ilike.*${term}*`];
    const params = new URLSearchParams({
      select: "id,first_name,last_name,position,phone,email,department,office",
      or: `(${nameFilters.join(",")})`,
      order: "last_name.asc", limit: "8",
    });
    const response = await fetch(`${supabaseUrl}/rest/v1/people?${params}`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
    if (!response.ok) {
      console.error("Supabase people query failed:", response.status, await response.text());
      await sendMessage(botToken, chatId, "در حال حاضر جست‌وجو با خطا مواجه شده است. لطفاً کمی بعد دوباره تلاش کنید.");
      return new Response("OK");
    }
    const people = await response.json();
    await db(supabaseUrl, serviceKey, userPath(userId, "telegram_user_id"), "PATCH", { search_count: Number(profile.search_count) + 1 }, "return=minimal");
    await db(supabaseUrl, serviceKey, "telegram_bot_search_history", "POST", {
      telegram_user_id: userId, search_term: term, result_count: Array.isArray(people) ? people.length : 0,
    }, "return=minimal");

    if (!Array.isArray(people) || people.length === 0) {
      await sendMessage(botToken, chatId, `موردی برای «${html(term)}» پیدا نکردم. نام را با املای دیگری امتحان کنید.`);
      return new Response("OK");
    }
    if (people.length === 1) {
      const keyboard = userId === ADMIN_ID ? ADMIN_KEYBOARD : mainKeyboard(profile.is_registered);
      await sendMessage(botToken, chatId, professorMessage(people[0]), keyboard);
      return new Response("OK");
    }

    const inlineKeyboard = people.map((person: any) => {
      const name = (String(person.first_name ?? "") + " " + String(person.last_name ?? "")).trim() || "استاد بدون نام";
      return [{
        text: name.slice(0, 64),
        callback_data: "prof:" + person.id + ":" + userId,
      }];
    });
    await sendMessage(
      botToken,
      chatId,
      "برای جست‌وجوی «" + html(term) + "» چند استاد پیدا شد. لطفاً استاد موردنظر را انتخاب کنید:",
      { inline_keyboard: inlineKeyboard },
    );
    return new Response("OK");
  } catch (error) {
    console.error("Bot handler error:", error);
    await sendMessage(botToken, chatId, "در پردازش درخواست مشکلی پیش اومد. لطفاً کمی بعد دوباره تلاش کنید.");
    return new Response("Handled", { status: 200 });
  }
});
