import type { TourStep } from './state'

type Can = (permission: string) => boolean

/** Yo'riqnoma nomlari serverda saqlanadi: o'zgartirsangiz, hamma uchun qaytadan ko'rsatiladi. */
export const TOURS = {
  welcome: 'welcome',
  clientWelcome: 'client-welcome',
  project: 'project',
  clientProject: 'client-project',
  incidents: 'incidents',
  deals: 'deals',
} as const

const help: TourStep = {
  target: 'help',
  title: 'Yo‘riqnoma doim shu yerda',
  body: '“?” tugmasini bossangiz, shu sahifaning yo‘riqnomasi qayta ochiladi. Har bo‘limning o‘z yo‘riqnomasi bor.',
}

/** Birinchi kirish: xodim (rahbar, admin, teamlead, dasturchi). */
export function welcomeTour(name: string, can: Can, canManageRoles: boolean): TourStep[] {
  const first = name.split(' ')[0]
  return [
    {
      title: `Xush kelibsiz, ${first}!`,
      body: 'LivePortal — loyihalar, tasklar, insidentlar va jamoa chati bir joyda. Muhim narsalarni Telegram bot o‘zi yozib turadi.\n\nBir daqiqada asosiy joylarni ko‘rsatamiz.',
    },
    { target: 'nav-projects', title: 'Loyihalar', body: can('dashboard.view_all') ? 'Workspace’dagi barcha loyihalar.' : 'Siz qo‘shilgan loyihalar. Boshqalarini ko‘rmaysiz — har loyiha faqat a’zolariga ochiq.' },
    { target: 'project-card', title: 'Loyihaga kirish', body: 'Kartani bosing: ichida tasklar boardi, insidentlar va chat. Kartada a’zolar soni, sizning rolingiz va muddat.' },
    { target: 'new-project', title: 'Yangi loyiha', body: 'Nomi va qisqa kaliti (masalan ITL) bilan. Yaratgan odam loyihaning teamlead’i bo‘ladi va jamoani o‘zi qo‘shadi.' },
    { target: 'nav-my', title: 'Mening tasklarim', body: 'Barcha loyihalardan sizga berilgan ishlar bitta ro‘yxatda: muddati o‘tgan va bugungilari tepada.' },
    ...(can('deal.manage') || can('deal.view_all')
      ? [{ target: 'nav-deals', title: 'Savdo', body: 'Loyiha boshlanishidan oldingi hamma narsa: mijoz so‘rovi, muhokama, taklif, shartnoma, avans. Har kelishuvda keyingi qadam bor — unutilmaydi.' }]
      : []),
    ...(can('dashboard.view_all')
      ? [{ target: 'nav-dashboard', title: 'Dashboard', body: 'Rahbar uchun: hal qilinmagan insidentlar, loyihalar progressi, kechikkan tasklar, kim qanchalik band.' }]
      : []),
    { target: 'nav-team', title: 'Jamoa', body: can('member.invite') ? 'Xodimlar ro‘yxati. Shu yerdan yangi odamni Telegram havolasi bilan taklif qilasiz, rolini o‘zgartirasiz yoki chiqarasiz.' : 'Hamkasblar ro‘yxati.' },
    ...(canManageRoles ? [{ target: 'nav-roles', title: 'Rollar', body: 'Kim nima qila olishini sozlash: masalan, “QA muhandis” roli — task ko‘radi va izoh yozadi, lekin yopa olmaydi.' }] : []),
    {
      title: 'Telegram bot',
      body: 'Sizga task berilsa, muddat o‘tsa, izohda belgilashsa yoki insident ochilsa — bot darhol yozadi. Xabardagi tugmalar bilan taskni boshlash yoki Review’ga yuborish mumkin.\n\nBotni bloklamang, aks holda xabarlar kelmaydi.',
    },
    help,
  ]
}

/** Birinchi kirish: mijoz. */
export function clientWelcomeTour(name: string): TourStep[] {
  return [
    {
      title: `Xush kelibsiz, ${name.split(' ')[0]}!`,
      body: 'Bu yerda loyihangiz jamoasi bilan bevosita yozishasiz: savol, fikr, skrinshot yoki fayl yuborasiz. Javob kelganda Telegram bot xabar beradi.',
    },
    { target: 'project-card', title: 'Loyihangiz', body: 'Kartani bosing — “Mijoz bilan” chat ochiladi.' },
    help,
  ]
}

/** Loyiha ichi (board). */
export function projectTour(can: Can): TourStep[] {
  return [
    {
      target: 'project-tabs',
      title: 'Loyiha bo‘limlari',
      body: 'Board — tasklar. Insidentlar — hozir yonayotgan nosozliklar. Jamoa chati — faqat xodimlar. “Mijoz bilan” — mijoz ham ko‘radi.\n\nSizga ochiq bo‘limlargina ko‘rinadi.',
    },
    {
      target: 'new-task',
      title: 'Yangi task',
      body: 'Nom, tur (task, xato, yangi funksiya), bir yoki bir nechta mas’ul, muddat (sana va soat) va prioritet. Mas’ullarga Telegram’da xabar boradi; mas’ul bo‘lmasa, dasturchilar o‘zi oladi.',
    },
    { target: 'board-filters', title: 'Qidiruv va filtrlar', body: 'Nom yoki raqam bo‘yicha qidiring; yonida — mas’ul (menga, egasiz), tur va prioritet. Filtr havolada saqlanadi: havolani yuborsangiz, hamkasb aynan shu ko‘rinishni ochadi.' },
    {
      target: 'board-column',
      title: 'Ustunlar = holat',
      body: can('task.close')
        ? 'Taskni ustundan ustunga sudrang: Backlog → To do → In progress → Review → Done. Review’dagi ishni tekshirib Done qilish — sizda.'
        : 'Taskni ustundan ustunga sudrang: Backlog → To do → In progress → Review. Tayyor bo‘lsa Review’ga qo‘ying — teamlead tekshirib Done qiladi.',
    },
    {
      target: 'task-card',
      title: 'Task kartasi',
      body: 'Bosing: tafsilot, kichik vazifalar, izohlar (@ bilan belgilash) va tarix. Egasiz taskni “🙋 Men olaman” bilan o‘zingiz olasiz. ☑ 1/3 — kichik vazifalar progressi.',
    },
    { target: 'project-members', title: 'Loyiha jamoasi', body: can('project.member.manage') ? 'A’zolar va rollari. Shu yerdan odam qo‘shasiz (dasturchi, teamlead, mijoz) yoki chiqarasiz.' : 'Loyihada kim bor va qaysi rolda.' },
    help,
  ]
}

/** Mijozning loyiha sahifasi (faqat chat). */
export function clientProjectTour(): TourStep[] {
  return [
    {
      target: 'chat-composer',
      title: 'Jamoaga yozing',
      body: 'Matn yozing, rasmni Ctrl/⌘+V bilan joylang yoki 📎 bilan fayl biriktiring. Jamoaga Telegram’da xabar boradi; javob kelsa, sizga ham.',
    },
    help,
  ]
}

/** Insidentlar bo'limi. */
export function incidentsTour(can: Can): TourStep[] {
  return [
    {
      target: 'incident-new',
      title: 'Insident ochish',
      body: 'Sayt yoki xizmat ishlamay qolsa — shu yerda. Daraja (SEV1 kritik … SEV4 kichik), mas’ul va qachon boshlangani. Ochilishi bilan jamoaga Telegram xabari boradi.',
    },
    { target: 'incident-filters', title: 'Hal qilinmagan / hal qilingan', body: 'Ochiq insidentlar eng og‘iri birinchi. Hal qilinganlarida “sabab va yechim” — keyingi safar uchun saboq.' },
    {
      title: 'Insident ichida',
      body: `Holat bosqichlari: Ochiq → Tekshirilmoqda → Kuzatuvda → Hal qilindi. Xronologiyaga yangilanish, skrinshot yoki log yozing${can('task.create') ? ', tuzatish ishlarini shu yerdan task qilib bering' : ''}.`,
    },
    help,
  ]
}

/** Savdo (kelishuvlar) boardi. */
export function dealsTour(supervisor: boolean): TourStep[] {
  return [
    {
      target: 'deal-summary',
      title: supervisor ? 'Bir qarashda' : 'Sizning savdongiz',
      body: 'Nechta faol kelishuv, qancha pul kutilyapti va nechtasi qotib qolgan (keyingi qadami 24 soatdan beri bajarilmagan). “Qotib qolgan”ni bossangiz — faqat ular qoladi.',
    },
    { target: 'deal-new', title: 'Yangi kelishuv', body: 'Mijoz murojaat qilishi bilan yozing: kim, nima kerak, taxminiy summa va keyingi qadam (masalan, “ertaga 10:00 da qo‘ng‘iroq”).' },
    {
      target: 'deal-column',
      title: 'Bosqichlar',
      body: 'Yangi so‘rov → Muhokama → Taklif → Shartnoma → Avans kutilmoqda. Kartani ustundan ustunga sudrang. “Yo‘qotildi” — sababi bilan; “Yutildi” — avans tushib, rahbar “ha” deganda.',
    },
    {
      target: 'deal-card',
      title: 'Keyingi qadam',
      body: 'Kartada — navbatdagi ish va vaqti. Vaqti kelsa, bot mas’ulga eslatadi; 24 soatda bajarilmasa — rahbarga. Bajargach: kartani ochib, “✓ Bajarildi” → natija va yangi qadam.',
    },
    help,
  ]
}
