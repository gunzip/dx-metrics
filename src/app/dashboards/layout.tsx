import { auth, signOut } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const skipAuth = process.env.SKIP_AUTH === "true";
  const session = skipAuth ? null : await auth();
  if (!skipAuth && !session?.user) {
    redirect("/sign-in");
  }

  return (
    <div className="flex min-h-screen bg-[#0a0c10] font-sans">
      <Sidebar />
      <div className="ml-56 flex-1">
        <header className="flex items-center justify-between border-b border-[#30363d] bg-[#0d1117]/80 backdrop-blur-md sticky top-0 z-10 px-6 py-4">
          <div />
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#21262d] border border-[#30363d]">
              {session?.user?.image && (
                <img
                  src={session.user.image}
                  alt=""
                  className="h-6 w-6 rounded-full ring-1 ring-[#8b949e]/20"
                />
              )}
              <span className="text-xs font-medium text-[#e6edf3]">
                {session?.user?.name ?? "Local Dev"}
              </span>
            </div>
            {!skipAuth && (
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/sign-in" });
                }}
              >
                <button
                  type="submit"
                  className="text-xs font-semibold text-gray-500 hover:text-white transition-colors"
                >
                  Sign out
                </button>
              </form>
            )}
          </div>
        </header>
        <main className="p-8 max-w-[1600px] mx-auto">{children}</main>
      </div>
    </div>
  );
}
