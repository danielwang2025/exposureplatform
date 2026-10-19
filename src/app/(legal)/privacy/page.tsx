import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { LEGAL_UPDATED, LegalPage, type LegalSection } from "../legal-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: t("privacy") };
}

const en: LegalSection[] = [
  {
    heading: "Who we are",
    body: (
      <p>
        Sprout is operated by [Company name], [address] (“we”). Questions about privacy: [privacy@example.com].
      </p>
    ),
  },
  {
    heading: "Sprout is for parents and guardians",
    body: (
      <>
        <p>
          Accounts are only for adults (18+). Children do not have accounts and never sign in. Information about a child
          is added by their parent or legal guardian, who confirms that they are the guardian and consents to storing it.
          If you believe a child has created an account, contact us and we will delete it.
        </p>
      </>
    ),
  },
  {
    heading: "What we collect",
    body: (
      <ul>
        <li>Account: email address, display name and a securely hashed password.</li>
        <li>
          What you add about a child: nickname, optional date of birth, posts, photos, videos, projects and comments.
        </li>
        <li>Photos are re-encoded before upload, which removes embedded location (GPS) and camera data.</li>
        <li>
          Technical data: server logs (IP address, browser, time) kept for security for up to [30] days. We use only
          essential cookies — your sign-in session and language. No advertising or cross-site tracking.
        </li>
      </ul>
    ),
  },
  {
    heading: "How we use it",
    body: (
      <p>
        Only to run Sprout for you: storing and showing your content to the people you choose, sending service emails
        (such as invitations and password resets), keeping the service secure, and meeting legal obligations. We do not
        sell personal data, show ads, or use your content to train AI models.
      </p>
    ),
  },
  {
    heading: "Who can see your content",
    body: (
      <ul>
        <li>Family members you invite, according to the role and visibility you choose for each post.</li>
        <li>Anyone with a share link you create, for posts set to “Anyone with the link” or wider.</li>
        <li>Anyone, for posts set to “Public page” when you turn on a public page. Public pages ask search engines not to index them.</li>
        <li>
          Service providers who process data on our behalf: Supabase (database, authentication, file storage), Mux (video),
          Vercel (hosting), Stripe (payments and tax, if you subscribe to Plus; card details go to Stripe, never to us) and
          [email provider]. They may only use it to provide their service to us.
        </li>
        <li>Authorities, where we are legally required to.</li>
      </ul>
    ),
  },
  {
    heading: "Keeping and deleting data",
    body: (
      <p>
        We keep your content until you delete it. Deleting a post, child profile or your account removes it from Sprout
        immediately and from backups within [30] days. When you delete your account, child profiles you are the only owner
        of are deleted; posts you added to profiles owned by others stay with that family.
      </p>
    ),
  },
  {
    heading: "Your rights",
    body: (
      <p>
        You can download all your data (Account → Download my data), correct it, and delete it (Account → Delete account) at
        any time. Depending on where you live (for example under the GDPR, UK GDPR or CCPA) you may also have rights to
        object, restrict processing and complain to a data protection authority. Contact [privacy@example.com].
      </p>
    ),
  },
  {
    heading: "Security and international transfers",
    body: (
      <p>
        Data is encrypted in transit, files are stored privately and served through short-lived signed links, and access is
        enforced by the database for every request. Our providers may process data in [regions]; where required we rely on
        Standard Contractual Clauses.
      </p>
    ),
  },
  {
    heading: "Changes",
    body: <p>We will notify you by email before material changes take effect.</p>,
  },
];

const zh: LegalSection[] = [
  {
    heading: "我们是谁",
    body: <p>Sprout 由 [公司名称]（[地址]）运营（下称“我们”）。隐私问题请联系 [privacy@example.com]。</p>,
  },
  {
    heading: "Sprout 面向家长和监护人",
    body: (
      <p>
        账号仅供成年人（18 岁及以上）使用。孩子没有账号，也不会登录。孩子的信息由其家长或法定监护人添加，添加时监护人确认其身份并同意保存这些信息。如果你认为有孩子注册了账号，请联系我们，我们会将其删除。
      </p>
    ),
  },
  {
    heading: "我们收集哪些信息",
    body: (
      <ul>
        <li>账号信息：邮箱、显示名称，以及经过安全哈希处理的密码。</li>
        <li>你添加的孩子信息：昵称、选填的出生日期、记录、照片、视频、成长项目和评论。</li>
        <li>照片在上传前会重新编码，嵌入的位置（GPS）和设备信息会被去除。</li>
        <li>技术数据：出于安全目的保存最多 [30] 天的服务器日志（IP 地址、浏览器、时间）。我们只使用必要的 Cookie——登录状态和语言设置，没有广告或跨站追踪。</li>
      </ul>
    ),
  },
  {
    heading: "我们如何使用这些信息",
    body: (
      <p>
        仅用于为你提供 Sprout 服务：保存内容并展示给你选择的人、发送服务邮件（如邀请和重置密码）、保障服务安全以及履行法律义务。我们不出售个人信息、不投放广告，也不使用你的内容训练 AI 模型。
      </p>
    ),
  },
  {
    heading: "谁能看到你的内容",
    body: (
      <ul>
        <li>你邀请的家人，按照你为每条记录设置的角色和可见范围。</li>
        <li>持有你创建的分享链接的人，仅限可见范围为“持链接可见”或更大的记录。</li>
        <li>开启公开主页后，可见范围为“公开主页”的记录对所有人可见。公开主页会要求搜索引擎不要收录。</li>
        <li>代表我们处理数据的服务商：Supabase（数据库、身份验证、文件存储）、Mux（视频）、Vercel（托管）、Stripe（付款和税费，仅在你订阅 Plus 时；银行卡信息只交给 Stripe，不经过我们）以及 [邮件服务商]。它们只能将数据用于向我们提供服务。</li>
        <li>法律要求时的主管机关。</li>
      </ul>
    ),
  },
  {
    heading: "数据保留与删除",
    body: (
      <p>
        你的内容会一直保留，直到你删除。删除记录、孩子档案或账号后，内容立即从 Sprout 中移除，并在 [30] 天内从备份中删除。删除账号时，你作为唯一所有者的孩子档案会被删除；你在他人拥有的档案中添加的记录会保留给那个家庭。
      </p>
    ),
  },
  {
    heading: "你的权利",
    body: (
      <p>
        你可以随时下载全部数据（账号 → 下载我的数据）、更正数据和删除数据（账号 → 删除账号）。根据你所在地区（例如 GDPR、英国 GDPR 或 CCPA），你还可能有权反对或限制处理，并向数据保护机构投诉。请联系 [privacy@example.com]。
      </p>
    ),
  },
  {
    heading: "安全与跨境传输",
    body: (
      <p>
        数据在传输中加密，文件私密存储并通过短时有效的签名链接提供，每次请求都由数据库强制执行访问控制。我们的服务商可能在 [地区] 处理数据；在需要时我们依据标准合同条款进行传输。
      </p>
    ),
  },
  {
    heading: "政策变更",
    body: <p>重大变更生效前，我们会通过邮件通知你。</p>,
  },
];

export default async function PrivacyPage() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("legal")]);
  return (
    <LegalPage
      title={t("privacy")}
      updated={t("updated", { date: LEGAL_UPDATED })}
      sections={locale === "zh" ? zh : en}
    />
  );
}
