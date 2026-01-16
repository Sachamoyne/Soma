/**
 * Maps Supabase authentication errors to user-friendly messages
 */

export interface AuthError {
  message: string;
  type: "email_not_found" | "wrong_password" | "email_not_confirmed" | "email_already_exists" | "weak_password" | "invalid_email" | "unknown";
}

/**
 * Maps Supabase error to user-friendly message
 */
export function mapAuthError(error: any, context: "signin" | "signup"): AuthError {
  if (!error) {
    return { message: "Une erreur est survenue", type: "unknown" };
  }

  const errorMessage = error.message?.toLowerCase() || "";
  const errorCode = error.code || error.status || "";

  // Email not found (sign in only)
  if (context === "signin") {
    if (
      errorMessage.includes("invalid login credentials") ||
      errorMessage.includes("email not found") ||
      errorCode === "invalid_credentials"
    ) {
      // Check if it's actually email not found vs wrong password
      // Supabase returns same error for both, so we need to check differently
      // For now, we'll show a generic message, but ideally we'd check if email exists first
      return {
        message: "Email ou mot de passe incorrect",
        type: "wrong_password",
      };
    }

    // Email not confirmed
    if (
      errorMessage.includes("email not confirmed") ||
      errorMessage.includes("email_not_confirmed") ||
      errorCode === "email_not_confirmed"
    ) {
      return {
        message: "Veuillez confirmer votre email avant de vous connecter.",
        type: "email_not_confirmed",
      };
    }
  }

  // Sign up errors
  if (context === "signup") {
    // Email already exists
    if (
      errorMessage.includes("user already registered") ||
      errorMessage.includes("email already exists") ||
      errorCode === "signup_disabled" ||
      errorCode === "user_already_registered"
    ) {
      return {
        message: "Un compte existe déjà avec cet email. Connectez-vous ou réinitialisez votre mot de passe.",
        type: "email_already_exists",
      };
    }

    // Weak password
    if (
      errorMessage.includes("password") && 
      (errorMessage.includes("weak") || errorMessage.includes("short") || errorMessage.includes("minimum"))
    ) {
      return {
        message: "Le mot de passe doit contenir au moins 6 caractères.",
        type: "weak_password",
      };
    }

    // Invalid email
    if (errorMessage.includes("invalid email") || errorMessage.includes("email format")) {
      return {
        message: "Format d'email invalide.",
        type: "invalid_email",
      };
    }
  }

  // Generic fallback
  return {
    message: error.message || "Une erreur est survenue. Veuillez réessayer.",
    type: "unknown",
  };
}

/**
 * Checks if user needs to confirm email (for sign in)
 * This is a helper to provide more specific error messages
 */
export function getEmailConfirmationMessage(): string {
  return "Veuillez confirmer votre email avant de vous connecter. Vérifiez votre boîte de réception.";
}
