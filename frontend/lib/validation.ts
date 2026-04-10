import { z } from "zod";

export const authSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

export const onboardingSchema = z.object({
  idea: z.string().min(10, "Describe the idea in at least 10 characters."),
  targetUsers: z.string().min(3, "Add your target users."),
  problem: z.string().min(10, "Describe the problem in at least 10 characters."),
  blockerType: z.string().min(1, "Select what's holding you back."),
  domain: z.string().min(2, "Tell us your domain or industry."),
});

export const projectCreateSchema = z.object({
  projectName: z.string().min(3, "Project name is required."),
  ideaDescription: z.string().min(10, "Add more detail about the idea."),
  targetUsers: z.string().min(3, "Target users are required."),
});
