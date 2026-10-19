import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { LEGAL_UPDATED, LegalPage, type LegalSection } from "../legal-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: t("terms") };
}

const en: LegalSection[] = [
  {
    heading: "Using Sprout",
    body: (
      <p>
        By creating an account you agree to these terms. You must be at least 18 and may only add children for whom you
        are a parent or legal guardian, or to whose profile a guardian has invited you.
      </p>
    ),
  },
  {
    heading: "Your content",
    body: (
      <p>
        You own what you post. You give us permission to store, process and display it only as needed to run Sprout for
        you and the people you share with. This permission ends when you delete the content.
      </p>
    ),
  },
  {
    heading: "Acceptable use",
    body: (
      <ul>
        <li>Don’t post content about children you are not authorised to share.</li>
        <li>Don’t post anything illegal, sexualised, hateful or that endangers a child. We will remove it, may close the account and will report it where required by law.</li>
        <li>Don’t try to access profiles you weren’t invited to, or disrupt the service.</li>
      </ul>
    ),
  },
  {
    heading: "Sharing",
    body: (
      <p>
        You decide who sees each post. Anyone with a share link can view what it reveals and may copy it; revoke links you
        no longer need. You are responsible for whom you invite and what you make public.
      </p>
    ),
  },
  {
    heading: "Plans and storage",
    body: <p>The free plan includes [2 GB] of storage. Paid plans, if offered, will be described before you buy.</p>,
  },
  {
    heading: "Ending your account",
    body: (
      <p>
        You can delete your account at any time from the Account page. We may suspend accounts that break these terms. We
        will give reasonable notice before discontinuing the service so you can download your data.
      </p>
    ),
  },
  {
    heading: "Disclaimers and liability",
    body: (
      <p>
        Sprout is provided “as is”. Keep your own copies of important memories. To the extent permitted by law, our total
        liability is limited to the amount you paid us in the 12 months before the claim. Nothing here limits rights you
        have as a consumer.
      </p>
    ),
  },
  {
    heading: "Law and contact",
    body: (
      <p>
        These terms are governed by the laws of [jurisdiction]. Questions: [support@example.com].
      </p>
    ),
  },
];

const zh: LegalSection[] = [
  {
    heading: "使用 Sprout",
    body: (
      <p>
        创建账号即表示你同意本条款。你必须年满 18 岁，并且只能添加你作为家长或法定监护人的孩子，或者由监护人邀请你加入的孩子档案。
      </p>
    ),
  },
  {
    heading: "你的内容",
    body: (
      <p>
        你发布的内容归你所有。你授权我们仅在为你及你分享的对象提供 Sprout 服务所需的范围内存储、处理和展示这些内容。删除内容后，此授权即终止。
      </p>
    ),
  },
  {
    heading: "使用规范",
    body: (
      <ul>
        <li>不要发布你无权分享的孩子的内容。</li>
        <li>不要发布任何违法、色情化、仇恨或危害儿童的内容。我们会将其删除，可能关闭账号，并在法律要求时报告。</li>
        <li>不要尝试访问你未被邀请的档案，或干扰服务运行。</li>
      </ul>
    ),
  },
  {
    heading: "分享",
    body: (
      <p>
        每条记录由你决定谁能看到。持有分享链接的人可以查看链接所展示的内容，也可能将其复制；不再需要的链接请及时撤销。你需要对邀请的人和公开的内容负责。
      </p>
    ),
  },
  {
    heading: "套餐与存储空间",
    body: <p>免费套餐包含 [2 GB] 存储空间。如提供付费套餐，购买前会说明具体内容。</p>,
  },
  {
    heading: "终止账号",
    body: (
      <p>
        你可以随时在账号页面删除账号。违反本条款的账号可能会被暂停。如果我们停止提供服务，会提前合理通知，方便你下载数据。
      </p>
    ),
  },
  {
    heading: "免责与责任限制",
    body: (
      <p>
        Sprout 按“现状”提供，重要的回忆请自行保留备份。在法律允许的范围内，我们的全部责任以你在索赔前 12 个月内支付给我们的金额为限。本条款不限制你作为消费者依法享有的权利。
      </p>
    ),
  },
  {
    heading: "适用法律与联系方式",
    body: <p>本条款受 [司法辖区] 法律管辖。如有疑问请联系 [support@example.com]。</p>,
  },
];

export default async function TermsPage() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("legal")]);
  return (
    <LegalPage title={t("terms")} updated={t("updated", { date: LEGAL_UPDATED })} sections={locale === "zh" ? zh : en} />
  );
}
