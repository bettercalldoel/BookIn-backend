/**
 * Authentication middleware
 *
 * This middleware simulates an authenticated user.
 * Replace this logic with real JWT verification later.
 */
export const authMiddleware = (req: any, res: any, next: any) => {
  // 🚨 TEMPORARY: mock authenticated user
  // Later, decode JWT and set real user data here
  req.user = {
    id: "user-uuid",
    role: "USER", // or "OWNER"
  };

  next();
};
