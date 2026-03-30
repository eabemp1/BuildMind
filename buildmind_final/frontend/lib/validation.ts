import { z } from "zod";

export const authSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

export const onboardingSchema = z.object({
  idea: z.string().min(10, "Describe the idea in at least 10 characters."),
  targetUsers: z.string().min(3, "Add your target users."),
  problem: z.string().min(10, "Describe the problem in at least 10 characters."),
});

export const projectCreateSchema = z.object({
  projectName: z.string().min(3, "Project name is required."),
  ideaDescription: z.string().min(10, "Add more detail about the idea."),
  targetUsers: z.string().min(3, "Target users are required."),
});

