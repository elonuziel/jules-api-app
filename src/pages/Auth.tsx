import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.svg";
import { ArrowRight, ExternalLink, KeyRound, ShieldCheck, UserX } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isAuthenticated, hasKey, saveApiKey, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );

  const [inputKey, setInputKey] = useState("");
  const [rememberKey, setRememberKey] = useState<"local" | "session">("local");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If the user already has a key configured, direct them straight to dashboard
    if (hasKey) {
      navigate(redirect);
    }
  }, [hasKey, navigate, redirect]);

  const handleConnectWithKey = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputKey.trim();
    if (!trimmed) {
      setError("Please enter your Jules API key.");
      return;
    }
    setError(null);
    saveApiKey(trimmed, rememberKey === "local");
    navigate(redirect);
  };

  const handleContinueAsGuest = async () => {
    await signIn();
    navigate(redirect);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-50">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card className="border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-md">
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center">
                <img
                  src={logo}
                  alt="Jules Console"
                  width={56}
                  height={56}
                  className="rounded-xl mb-3 cursor-pointer shadow-md"
                  onClick={() => navigate("/")}
                />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight text-white">
                Connect Jules Console
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Direct client-side access to the Google Jules API
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6 pt-2">
              <form onSubmit={handleConnectWithKey} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="api-key" className="text-xs font-medium text-slate-300">
                      Google Jules API Key
                    </Label>
                    <a
                      href="https://jules.google.com/settings#api"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
                    >
                      Get API Key <ExternalLink className="size-3" />
                    </a>
                  </div>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-3 size-4 text-slate-500" />
                    <Input
                      id="api-key"
                      type="password"
                      placeholder="Paste your Jules API key..."
                      className="pl-9 bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 text-xs font-mono"
                      value={inputKey}
                      onChange={(e) => {
                        setInputKey(e.target.value);
                        if (error) setError(null);
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <Label className="text-[11px] font-medium text-slate-400">Storage Option</Label>
                  <RadioGroup
                    value={rememberKey}
                    onValueChange={(v) => setRememberKey(v as "local" | "session")}
                    className="gap-2 text-xs"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="local" id="storage-local" className="border-slate-700 text-blue-500" />
                      <Label htmlFor="storage-local" className="text-xs text-slate-300 font-normal cursor-pointer">
                        Remember on this device <span className="text-[10px] text-slate-500">(localStorage)</span>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="session" id="storage-session" className="border-slate-700 text-blue-500" />
                      <Label htmlFor="storage-session" className="text-xs text-slate-300 font-normal cursor-pointer">
                        This session only <span className="text-[10px] text-slate-500">(cleared when closed)</span>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {error && (
                  <p className="text-xs text-red-400 text-center">{error}</p>
                )}

                <Button
                  type="submit"
                  className="w-full h-10 text-xs font-medium gap-2 bg-blue-600 hover:bg-blue-500 text-white shadow-md"
                >
                  Connect & Open Console
                  <ArrowRight className="size-3.5" />
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-800" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase">
                  <span className="bg-slate-900 px-2 text-slate-500">or</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full h-10 text-xs font-medium gap-2 border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white"
                onClick={handleContinueAsGuest}
              >
                <UserX className="size-3.5" />
                Continue to Console (Enter Key Later)
              </Button>

              <div className="flex items-start gap-2 rounded-lg border border-emerald-950/60 bg-emerald-950/20 p-3 text-[11px] text-emerald-300">
                <ShieldCheck className="size-4 shrink-0 text-emerald-400 mt-0.5" />
                <span>
                  <strong>100% Client-Side:</strong> Your API key is stored only in your browser/device storage and connects directly to Google Jules without intermediate servers.
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
