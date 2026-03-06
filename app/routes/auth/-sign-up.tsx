import { SignUp } from "@clerk/tanstack-react-start";
import { useRouterState } from "@tanstack/react-router";
import { isSelfHosted } from "@/lib/selfHosted";
import { SignUpForm } from "@/components/auth/SignUpForm";

export default function SignUpPage() {
  if (isSelfHosted) {
    return <SignUpForm />;
  }

  return <ClerkSignUp />;
}

function ClerkSignUp() {
  const search = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const redirectUrl = new URLSearchParams(search).get("redirect_url");

  return (
    <SignUp
      fallbackRedirectUrl={redirectUrl || "/dashboard"}
      appearance={{
        elements: {
          formButtonPrimary:
            "bg-[#4CA7F8] hover:bg-[#3a95e0] text-white rounded-xl font-semibold text-sm transition-all shadow-none",
          card: "glass shadow-lg",
          headerTitle: "text-gray-900 font-bold text-2xl",
          headerSubtitle: "text-gray-500",
          socialButtonsBlockButton:
            "border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-xl transition-all",
          socialButtonsBlockButtonText: "!text-current font-medium",
          socialButtonsBlockButtonArrow: "text-current",
          formFieldLabel: "text-gray-700 font-medium",
          formFieldInput:
            "bg-white border border-gray-200 text-gray-900 focus:border-[#4CA7F8] focus:ring-1 focus:ring-[#4CA7F8] rounded-lg",
          footerActionLink: "text-[#4CA7F8] hover:text-[#3a95e0] font-medium",
          footerActionText: "text-gray-500",
          dividerLine: "bg-gray-200",
          dividerText: "text-gray-400 font-medium",
          identityPreviewText: "text-gray-900",
          identityPreviewEditButton: "text-[#4CA7F8] hover:text-[#3a95e0]",
          formFieldInputShowPasswordButton:
            "text-gray-400 hover:text-gray-600",
          footer: "hidden",
          internal: "text-gray-900",
        },
        variables: {
          colorPrimary: "#4CA7F8",
          colorBackground: "transparent",
          colorInputBackground: "#ffffff",
          colorInputText: "#1a1a1a",
          colorText: "#1a1a1a",
          colorTextSecondary: "#6b7280",
          colorTextOnPrimaryBackground: "#ffffff",
          colorNeutral: "#1a1a1a",
          borderRadius: "0.75rem",
        },
      }}
    />
  );
}
