import { SignIn } from "@clerk/tanstack-react-start";
import { useRouterState } from "@tanstack/react-router";
import { isSelfHosted } from "@/lib/selfHosted";
import { SignInForm } from "@/components/auth/SignInForm";

export default function SignInPage() {
  if (isSelfHosted) {
    return <SignInForm />;
  }

  return <ClerkSignIn />;
}

function ClerkSignIn() {
  const search = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const redirectUrl = new URLSearchParams(search).get("redirect_url");

  return (
    <SignIn
      fallbackRedirectUrl={redirectUrl || "/dashboard"}
      signUpUrl="/sign-in"
      appearance={{
        elements: {
          card: "shadow-none border border-[#1a1a1a]/20 bg-white/75 rounded-none",
          headerTitle: "hidden",
          headerSubtitle: "hidden",
          socialButtonsBlockButton:
            "border border-[#1a1a1a]/20 bg-white hover:bg-[#f8f8f8] text-[#111827] rounded-none transition-colors",
          socialButtonsBlockButtonText: "!text-current font-medium",
          socialButtonsBlockButtonArrow: "text-current",
          formButtonPrimary:
            "bg-[#111827] hover:bg-[#1f2937] text-white rounded-none font-semibold text-sm transition-colors shadow-none",
          formFieldLabel: "text-[#374151] font-medium",
          formFieldInput:
            "bg-white border border-[#d1d5db] text-[#111827] focus:border-[#111827] focus:ring-1 focus:ring-[#111827] rounded-none",
          footerActionLink: "hidden",
          footerActionText: "hidden",
          dividerLine: "bg-[#e5e7eb]",
          dividerText: "text-[#6b7280] font-medium",
          identityPreviewText: "text-[#111827]",
          identityPreviewEditButton: "text-[#111827] hover:text-[#374151]",
          formFieldInputShowPasswordButton:
            "text-[#6b7280] hover:text-[#111827]",
          footer: "hidden",
          internal: "text-[#111827]",
        },
        variables: {
          colorPrimary: "#111827",
          colorBackground: "transparent",
          colorInputBackground: "#ffffff",
          colorInputText: "#111827",
          colorText: "#111827",
          colorTextSecondary: "#6b7280",
          colorTextOnPrimaryBackground: "#ffffff",
          colorNeutral: "#111827",
          borderRadius: "0",
        },
      }}
    />
  );
}
