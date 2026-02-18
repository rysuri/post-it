export const logout = (req, res) => {
  res.setHeader(
    "Set-Cookie",
    `session=; HttpOnly; Secure; SameSite=None; Max-Age=0; Path=/; Partitioned`,
  );

  return res.status(200).json({ message: "Logged out successfully" });
};
