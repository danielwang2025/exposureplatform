export default function AuthLayout({ children }: LayoutProps<"/">) {
  return <div className="flex flex-1 items-start justify-center px-4 py-12 sm:py-20">{children}</div>;
}
