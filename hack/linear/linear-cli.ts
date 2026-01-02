#!/usr/bin/env node

import { LinearClient } from "@linear/sdk";
import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import { execSync } from "child_process";
import fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import { URL } from "url";

// Image handling utilities
function extractImageUrls(markdown: string): Array<{url: string, altText: string}> {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const images: Array<{url: string, altText: string}> = [];
  let match;

  while ((match = imageRegex.exec(markdown)) !== null) {
    const altText = match[1] || "image";
    const url = match[2];

    // Only include URLs that look like image URLs
    if (url.startsWith("http") &&
        (url.includes("uploads.linear.app") ||
         url.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i))) {
      images.push({ url, altText });
    }
  }

  return images;
}

function getFileExtension(url: string, altText: string): string {
  // Try to get extension from URL
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
    if (match) {
      return match[1].toLowerCase();
    }
  } catch {}

  // Try to get extension from alt text
  const altMatch = altText.match(/\.([a-zA-Z0-9]+)$/);
  if (altMatch) {
    return altMatch[1].toLowerCase();
  }

  // Default to png
  return "png";
}

async function downloadImage(url: string, outputPath: string): Promise<void> {
  // If URL contains a signature parameter, it's already authenticated (signed URL)
  // Otherwise, add Bearer token for Linear uploads
  const headers: any = {};
  if (url.includes('uploads.linear.app') && !url.includes('signature=') && process.env.LINEAR_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.LINEAR_API_KEY}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.buffer();

  // Ensure directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, buffer);
}

function getThoughtsImagesPath(issueId: string): string {
  // Construct path relative to current working directory
  const thoughtsDir = path.join(process.cwd(), "thoughts", "shared", "images", issueId.toUpperCase());
  return thoughtsDir;
}

// Initialize Linear client only if API key is available
let linear: LinearClient | undefined;

// Only require API key for commands that need it, not for help or completions
const needsAuth = process.argv.length > 2 &&
  !['--help', '-h', '--version', '-v', 'completion', 'help'].includes(process.argv[2]) &&
  !process.argv.includes('--help') && !process.argv.includes('-h');

if (needsAuth) {
  if (!process.env.LINEAR_API_KEY) {
    console.error(chalk.red("Error: Missing LINEAR_API_KEY environment variable"));
    console.error(chalk.yellow("Please set it with: export LINEAR_API_KEY=your_api_key"));
    process.exit(1);
  }
  
  linear = new LinearClient({
    apiKey: process.env.LINEAR_API_KEY,
  });
}

// Git branch utility functions
function getGitBranch(): string {
  try {
    return execSync("git branch --show-current").toString().trim();
  } catch (error) {
    return "";
  }
}

function extractIssueId(branchName: string): string | null {
  // Match patterns like ENG-123, eng-123, B2BPROD-206, etc.
  const match = branchName.match(/[A-Za-z0-9]+-\d+/);
  return match ? match[0].toUpperCase() : null;
}

async function getIssueIdInteractively(defaultId: string | null = null): Promise<string> {
  const { issueId } = await inquirer.prompt({
    type: "input",
    name: "issueId",
    message: "Enter Linear issue ID (e.g. ENG-123, B2BPROD-206):",
    default: defaultId,
    validate: (input) => {
      return /^[A-Za-z0-9]+-\d+$/i.test(input) ? true : "Please enter a valid issue ID (e.g. ENG-123, B2BPROD-206)";
    },
  });
  
  return issueId.toUpperCase();
}

async function resolveIssueId(providedId?: string): Promise<string> {
  // If ID is provided as argument, use it
  if (providedId && /^[A-Za-z0-9]+-\d+$/i.test(providedId)) {
    return providedId.toUpperCase();
  }
  
  // Try to extract from git branch
  const gitBranch = getGitBranch();
  const idFromBranch = gitBranch ? extractIssueId(gitBranch) : null;
  
  // If found in branch, use it
  if (idFromBranch) {
    return idFromBranch;
  }
  
  // Otherwise, prompt user
  return getIssueIdInteractively(providedId || null);
}

// Command implementations
async function listIssues() {
  try {
    if (!linear) {
      throw new Error("Linear client not initialized. Check your API key.");
    }
    
    const user = await linear.viewer;
    const issues = await user.assignedIssues({ first: 50 });
    
    console.log(chalk.bold("\nYour assigned issues:"));
    
    if (!issues.nodes.length) {
      console.log(chalk.yellow("No issues assigned to you."));
      return;
    }
    
    // Filter out completed and canceled issues
    const activeIssues = [];
    
    for (const issue of issues.nodes) {
      const state = await issue.state;
      // Skip issues that are completed, canceled, or done
      if (state && (state.name.toLowerCase().includes("done") || 
                    state.name.toLowerCase().includes("completed") || 
                    state.name.toLowerCase().includes("canceled") ||
                    state.name.toLowerCase().includes("cancelled"))) {
        continue;
      }
      activeIssues.push(issue);
    }
    
    if (activeIssues.length === 0) {
      console.log(chalk.yellow("No active issues assigned to you."));
      return;
    }
    
    activeIssues.forEach((issue) => {
      console.log(`[${chalk.cyan(issue.identifier)}] ${issue.title}`);
    });
    
    // Show pagination info if there are more issues
    if (issues.pageInfo.hasNextPage) {
      console.log(chalk.dim("\nShowing first 50 active issues. There may be more issues available."));
    }
  } catch (error) {
    console.error(chalk.red("Error fetching issues:"), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function getIssue(issueId?: string) {
  try {
    if (!linear) {
      throw new Error("Linear client not initialized. Check your API key.");
    }

    const resolvedId = await resolveIssueId(issueId);
    const issue = await linear.issue(resolvedId);

    if (!issue) {
      console.error(chalk.red(`Issue ${resolvedId} not found.`));
      process.exit(1);
    }

    // Display main issue
    await displayIssue(issue);

    // Fetch and display parent issues
    const parentIssues = [];
    let currentIssue = issue;

    while (true) {
      const parent = await currentIssue.parent;
      if (!parent) break;

      parentIssues.push(parent);
      currentIssue = parent;
    }

    // Display parent issues in reverse order (oldest parent first)
    if (parentIssues.length > 0) {
      console.log(chalk.bold.yellow("\n═══════════════════════════════════════════════════════════════"));
      console.log(chalk.bold.yellow("PARENT ISSUES:"));
      console.log(chalk.bold.yellow("═══════════════════════════════════════════════════════════════"));

      for (let i = parentIssues.length - 1; i >= 0; i--) {
        const levelPrefix = "  ".repeat(parentIssues.length - i - 1) + "↳ ";
        console.log(chalk.yellow(`\n${levelPrefix}Parent Level ${parentIssues.length - i}:`));
        await displayIssue(parentIssues[i], false);
      }
    }
  } catch (error) {
    console.error(chalk.red("Error fetching issue:"), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function displayIssue(issue: any, showLinearUrl: boolean = true) {
  const comments = await issue.comments();
  const assignee = await issue.assignee;
  const state = await issue.state;

  // Format issue details with branch name in header
  console.log(chalk.bold(`\n[${issue.identifier}] ${issue.title}`));
  if (issue.branchName) {
    console.log(chalk.dim(`Branch: ${issue.branchName}`));
  }
  console.log(chalk.dim(`Status: ${state?.name || "Unknown"}`));

  if (assignee) {
    console.log(chalk.dim(`Assignee: ${assignee.name}`));
  }

  if (issue.description) {
    console.log(chalk.bold("\nDescription:"));
    console.log(issue.description);
  }

  // Format comments
  if (comments.nodes.length > 0) {
    console.log(chalk.bold("\nComments:"));

    // Reverse the comments array to show oldest first
    const reversedComments = [...comments.nodes].reverse();

    for (const comment of reversedComments) {
      let commentUser;
      try {
        commentUser = await comment.user;
      } catch (error) {
        // Handle case where user is null (bot comments, deleted users, etc.)
        commentUser = null;
      }

      const commentDate = new Date(comment.createdAt);
      const dateStr = commentDate.toISOString().split("T")[0];
      const timeStr = commentDate.toTimeString().split(" ")[0]; // HH:MM:SS format

      console.log(chalk.dim(`[${dateStr} ${timeStr}] ${commentUser?.name || "Unknown"}:`));
      console.log(comment.body);
      console.log(); // Empty line between comments
    }
  } else {
    console.log(chalk.dim("\nNo comments on this issue."));
  }

  if (showLinearUrl) {
    console.log(chalk.dim(`\nView in Linear: ${issue.url}`));
  }
}

async function addComment(message: string, options: { issueId?: string }) {
  try {
    if (!linear) {
      throw new Error("Linear client not initialized. Check your API key.");
    }

    // Ensure we have a message
    if (!message || message.trim() === '') {
      console.error(chalk.red("Error: Message required"));
      process.exit(1);
    }

    // Try to get issue ID from options or git branch, with interactive fallback
    // Use the same resolveIssueId function that getIssue uses for consistency
    const issueId = await resolveIssueId(options.issueId);

    // Create comment
    const result = await linear.createComment({
      issueId,
      body: message,
    });

    if (result.success) {
      console.log(chalk.green(`Comment added to issue ${issueId}!`));
    } else {
      console.error(chalk.red("Failed to add comment."));
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red("Error adding comment:"), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function updateStatus(issueId: string, statusName: string): Promise<void> {
  try {
    if (!linear) {
      throw new Error("Linear client not initialized. Check your API key.");
    }

    // Validate issue ID format
    if (!issueId || !/^[A-Za-z0-9]+-\d+$/i.test(issueId)) {
      console.error(chalk.red("Error: Invalid issue ID format. Expected format: ENG-123 or B2BPROD-206"));
      process.exit(1);
    }

    const normalizedId = issueId.toUpperCase();

    // First, fetch the issue to get its team
    const issue = await linear.issue(normalizedId);

    if (!issue) {
      console.error(chalk.red(`Issue ${normalizedId} not found.`));
      process.exit(1);
    }

    const team = await issue.team;
    if (!team) {
      console.error(chalk.red(`Could not determine team for issue ${normalizedId}.`));
      process.exit(1);
    }

    // Fetch available states for the team
    const states = await team.states();

    // Find the state by name (case-insensitive)
    const targetState = states.nodes.find(state =>
      state.name.toLowerCase() === statusName.toLowerCase()
    );

    if (!targetState) {
      console.error(chalk.red(`Status "${statusName}" not found for team ${team.name}.`));
      console.log(chalk.yellow("\nAvailable statuses:"));
      states.nodes.forEach(state => {
        console.log(`  - ${state.name}`);
      });
      process.exit(1);
    }

    // Update the issue with the new state
    const result = await linear.updateIssue(normalizedId, {
      stateId: targetState.id
    });

    if (result.success) {
      console.log(chalk.green(`✓ Updated ${normalizedId} status to "${targetState.name}"`));
    } else {
      console.error(chalk.red(`Failed to update status for ${normalizedId}.`));
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red("Error updating status:"), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function addLink(issueId: string, url: string, options: { title?: string }): Promise<void> {
  try {
    if (!linear) {
      throw new Error("Linear client not initialized. Check your API key.");
    }

    // Validate issue ID format
    if (!issueId || !/^[A-Za-z0-9]+-\d+$/i.test(issueId)) {
      console.error(chalk.red("Error: Invalid issue ID format. Expected format: ENG-123 or B2BPROD-206"));
      process.exit(1);
    }

    // Validate URL
    if (!url) {
      console.error(chalk.red("Error: URL is required"));
      process.exit(1);
    }

    try {
      new URL(url);
    } catch {
      console.error(chalk.red("Error: Invalid URL format"));
      process.exit(1);
    }

    const normalizedId = issueId.toUpperCase();

    // First, fetch the issue to verify it exists
    const issue = await linear.issue(normalizedId);

    if (!issue) {
      console.error(chalk.red(`Issue ${normalizedId} not found.`));
      process.exit(1);
    }

    // Create the attachment (link)
    const result = await linear.createAttachment({
      issueId: issue.id,
      url: url,
      title: options.title || url,
    });

    if (result.success) {
      console.log(chalk.green(`✓ Added link to issue ${normalizedId}`));
      if (options.title) {
        console.log(chalk.dim(`  Title: ${options.title}`));
      }
      console.log(chalk.dim(`  URL: ${url}`));
    } else {
      console.error(chalk.red(`Failed to add link to ${normalizedId}.`));
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red("Error adding link:"), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function assignToMe(issueId?: string): Promise<void> {
  try {
    if (!linear) {
      throw new Error("Linear client not initialized. Check your API key.");
    }

    // Resolve issue ID (from argument, git branch, or interactive prompt)
    const resolvedId = await resolveIssueId(issueId);

    // Get the current authenticated user
    const viewer = await linear.viewer;

    if (!viewer) {
      console.error(chalk.red("Error: Could not get authenticated user information."));
      process.exit(1);
    }

    // Update the issue with the authenticated user as assignee
    const result = await linear.updateIssue(resolvedId, {
      assigneeId: viewer.id
    });

    if (result.success) {
      console.log(chalk.green(`✓ Assigned ${resolvedId} to ${viewer.name || viewer.email}`));

      // Fetch and display the updated issue details
      const updatedIssue = await linear.issue(resolvedId);
      if (updatedIssue) {
        const state = await updatedIssue.state;
        console.log(chalk.dim(`  Status: ${state?.name || "Unknown"}`));
        console.log(chalk.dim(`  Title: ${updatedIssue.title}`));
        if (updatedIssue.url) {
          console.log(chalk.dim(`  View in Linear: ${updatedIssue.url}`));
        }
      }
    } else {
      console.error(chalk.red(`Failed to assign ${resolvedId} to you.`));
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red("Error assigning issue:"), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function fetchImages(issueId: string): Promise<void> {
  try {
    // Re-initialize Linear client with signed URL headers to get JWT-signed URLs
    const linearWithSignedUrls = new LinearClient({
      apiKey: process.env.LINEAR_API_KEY!,
      headers: {
        "public-file-urls-expire-in": "300"  // Request URLs that expire in 5 minutes
      }
    });

    // Validate issue ID format
    if (!issueId || !/^[A-Za-z0-9]+-\d+$/i.test(issueId)) {
      console.error(chalk.red("Error: Invalid issue ID format. Expected format: ENG-123 or B2BPROD-206"));
      process.exit(1);
    }

    const normalizedId = issueId.toUpperCase();

    // Fetch issue data with signed URLs
    const issue = await linearWithSignedUrls.issue(normalizedId);

    if (!issue) {
      console.error(chalk.red(`Issue ${normalizedId} not found.`));
      process.exit(1);
    }

    // Get issue description and comments with signed URLs
    const description = issue.description || "";
    const comments = await issue.comments();

    // Combine all content that might contain images
    let allContent = description;

    for (const comment of comments.nodes) {
      allContent += "\n" + comment.body;
    }

    // Extract image URLs (should now include JWT signatures)
    const images = extractImageUrls(allContent);

    if (images.length === 0) {
      console.log(chalk.dim("No images found in issue."));
      return;
    }

    // Prepare output directory
    const outputDir = getThoughtsImagesPath(normalizedId);

    // Download images
    const savedPaths: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < images.length; i++) {
      const { url, altText } = images[i];
      const extension = getFileExtension(url, altText);

      // Generate filename: ENG-1234-01.png format
      const paddedIndex = String(i + 1).padStart(2, '0');
      const filename = `${normalizedId}-${paddedIndex}.${extension}`;
      const outputPath = path.join(outputDir, filename);

      try {
        await downloadImage(url, outputPath);

        // Return relative path from current directory
        const relativePath = path.relative(process.cwd(), outputPath);
        savedPaths.push(relativePath);

        // Log progress to stderr so it doesn't interfere with stdout paths
        console.error(chalk.green(`✓ Downloaded ${filename}`));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to download image ${i + 1}: ${errorMsg}`);
        console.error(chalk.yellow(`⚠ Failed to download image ${i + 1}: ${errorMsg}`));
      }
    }

    // Output saved file paths to stdout (one per line)
    if (savedPaths.length > 0) {
      console.log(chalk.bold(`\nDownloaded ${savedPaths.length} image${savedPaths.length > 1 ? 's' : ''}:`));
      savedPaths.forEach(path => {
        console.log(path);
      });
    }

    // Exit with error code if some downloads failed
    if (errors.length > 0 && savedPaths.length === 0) {
      process.exit(1);
    }

  } catch (error) {
    console.error(chalk.red("Error fetching images:"), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function getIssueV2(issueId: string, options: {
  outputFormat?: string,
  fields?: string
}) {
  try {
    if (!linear) {
      throw new Error("Linear client not initialized. Check your API key.");
    }

    // Validate issue ID format
    if (!issueId || !/^[A-Za-z0-9]+-\d+$/i.test(issueId)) {
      console.error(chalk.red("Error: Invalid issue ID format. Expected format: ENG-123 or B2BPROD-206"));
      process.exit(1);
    }

    const normalizedId = issueId.toUpperCase();
    const outputFormat = options.outputFormat || "json";
    const useCompactJson = outputFormat === "json";
    const usePrettyJson = outputFormat === "rich-json";

    const requestedFields = options.fields
      ? options.fields.split(',').map(f => f.trim())
      : ["identifier", "title", "branch"];

    // Fetch the issue
    const issue = await linear.issue(normalizedId);

    if (!issue) {
      console.error(chalk.red(`Issue ${normalizedId} not found.`));
      process.exit(1);
    }

    // Collect issue data based on requested fields
    const issueData: any = {};

    if (requestedFields.includes("identifier")) {
      issueData.identifier = issue.identifier;
    }

    if (requestedFields.includes("title")) {
      issueData.title = issue.title;
    }

    if (requestedFields.includes("branch")) {
      issueData.branch = issue.branchName || null;
    }

    if (requestedFields.includes("description")) {
      issueData.description = issue.description || null;
    }

    if (requestedFields.includes("assignee")) {
      const assignee = await issue.assignee;
      issueData.assignee = assignee?.name || null;
    }

    if (requestedFields.includes("comments")) {
      const comments = await issue.comments();
      issueData.comments = [];

      for (const comment of comments.nodes) {
        let commentUser;
        try {
          commentUser = await comment.user;
        } catch (error) {
          commentUser = null;
        }

        issueData.comments.push({
          author: commentUser?.name || "Unknown",
          body: comment.body,
          createdAt: comment.createdAt
        });
      }
    }

    // Fetch parent issues if requested
    if (requestedFields.includes("parents")) {
      const parentIssues = [];
      let currentIssue = issue;

      while (true) {
        const parent = await currentIssue.parent;
        if (!parent) break;

        const parentData: any = {
          identifier: parent.identifier,
          title: parent.title
        };

        // Fetch additional parent fields if needed
        if (requestedFields.includes("description")) {
          parentData.description = parent.description || null;
        }

        if (requestedFields.includes("assignee")) {
          const parentAssignee = await parent.assignee;
          parentData.assignee = parentAssignee?.name || null;
        }

        if (requestedFields.includes("comments")) {
          const parentComments = await parent.comments();
          parentData.comments = [];

          for (const comment of parentComments.nodes) {
            let commentUser;
            try {
              commentUser = await comment.user;
            } catch (error) {
              commentUser = null;
            }

            parentData.comments.push({
              author: commentUser?.name || "Unknown",
              body: comment.body,
              createdAt: comment.createdAt
            });
          }
        }

        const parentState = await parent.state;
        parentData._state = parentState?.name || "Unknown";

        parentIssues.push(parentData);
        currentIssue = parent;
      }

      if (parentIssues.length > 0) {
        issueData.parents = parentIssues.reverse(); // Reverse to show oldest parent first
      }
    }

    // Always fetch state and estimate for markdown format
    const state = await issue.state;
    const assignee = await issue.assignee;

    issueData._state = state?.name || "Unknown";
    issueData._estimate = issue.estimate || null;
    issueData._assignee = assignee?.name || null;

    // Output based on format
    if (useCompactJson || usePrettyJson) {
      // For JSON, remove the internal fields and output clean JSON
      const cleanedData: any = {};
      for (const key of Object.keys(issueData)) {
        if (!key.startsWith('_')) {
          cleanedData[key] = issueData[key];
        }
      }
      console.log(JSON.stringify(cleanedData, null, usePrettyJson ? 2 : undefined));
    } else {
      // Markdown format
      if (requestedFields.includes("identifier") && requestedFields.includes("title")) {
        console.log(`[${chalk.cyan(issueData.identifier)}] ${issueData.title}`);
      } else if (requestedFields.includes("identifier")) {
        console.log(`[${chalk.cyan(issueData.identifier)}]`);
      } else if (requestedFields.includes("title")) {
        console.log(issueData.title);
      }

      console.log(chalk.dim(`Status: ${issueData._state}`));

      if (issueData._estimate) {
        console.log(chalk.dim(`Size: ${issueData._estimate}`));
      }

      if (requestedFields.includes("assignee") && issueData.assignee) {
        console.log(chalk.dim(`Assignee: ${issueData.assignee}`));
      } else if (issueData._assignee) {
        console.log(chalk.dim(`Assignee: ${issueData._assignee}`));
      }

      if (requestedFields.includes("branch") && issueData.branch) {
        console.log(chalk.dim(`Branch: ${issueData.branch}`));
      }

      if (requestedFields.includes("description") && issueData.description) {
        console.log(chalk.bold("\nDescription:"));
        console.log(issueData.description);
      }

      if (requestedFields.includes("comments") && issueData.comments && issueData.comments.length > 0) {
        console.log(chalk.bold("\nComments:"));
        for (const comment of issueData.comments) {
          const commentDate = new Date(comment.createdAt);
          const dateStr = commentDate.toISOString().split("T")[0];
          const timeStr = commentDate.toTimeString().split(" ")[0];
          console.log(chalk.dim(`[${dateStr} ${timeStr}] ${comment.author}:`));
          console.log(comment.body);
          console.log("");
        }
      }

      // Display parent issues if requested
      if (requestedFields.includes("parents") && issueData.parents && issueData.parents.length > 0) {
        console.log(chalk.bold.yellow("\n═══════════════════════════════════════════════════════════════"));
        console.log(chalk.bold.yellow("PARENT ISSUES:"));
        console.log(chalk.bold.yellow("═══════════════════════════════════════════════════════════════"));

        for (let i = 0; i < issueData.parents.length; i++) {
          const parent = issueData.parents[i];
          const levelPrefix = "  ".repeat(i) + "↳ ";
          console.log(chalk.yellow(`\n${levelPrefix}Parent Level ${i + 1}:`));

          console.log(chalk.bold(`\n${levelPrefix}[${parent.identifier}] ${parent.title}`));
          console.log(chalk.dim(`${levelPrefix}Status: ${parent._state}`));

          if (requestedFields.includes("assignee") && parent.assignee) {
            console.log(chalk.dim(`${levelPrefix}Assignee: ${parent.assignee}`));
          }

          if (requestedFields.includes("description") && parent.description) {
            console.log(chalk.bold(`\n${levelPrefix}Description:`));
            const descLines = parent.description.split('\n');
            for (const line of descLines) {
              console.log(`${levelPrefix}${line}`);
            }
          }

          if (requestedFields.includes("comments") && parent.comments && parent.comments.length > 0) {
            console.log(chalk.bold(`\n${levelPrefix}Comments:`));
            for (const comment of parent.comments) {
              const commentDate = new Date(comment.createdAt);
              const dateStr = commentDate.toISOString().split("T")[0];
              const timeStr = commentDate.toTimeString().split(" ")[0];
              console.log(chalk.dim(`${levelPrefix}[${dateStr} ${timeStr}] ${comment.author}:`));
              const commentLines = comment.body.split('\n');
              for (const line of commentLines) {
                console.log(`${levelPrefix}${line}`);
              }
              console.log("");
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(chalk.red("Error fetching issue:"), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function listTeams(options: { outputFormat?: string }) {
  try {
    if (!linear) {
      throw new Error("Linear client not initialized. Check your API key.");
    }

    const outputFormat = options.outputFormat || "markdown";
    const useJson = outputFormat === "json" || outputFormat === "rich-json";

    const teams = await linear.teams();

    if (!teams.nodes.length) {
      if (useJson) {
        console.log(JSON.stringify([], null, outputFormat === "rich-json" ? 2 : undefined));
      } else {
        console.log(chalk.yellow("No teams found."));
      }
      return;
    }

    if (useJson) {
      const teamsData = teams.nodes.map(team => ({
        id: team.id,
        key: team.key,
        name: team.name,
        description: team.description || null
      }));
      console.log(JSON.stringify(teamsData, null, outputFormat === "rich-json" ? 2 : undefined));
    } else {
      console.log(chalk.bold("\nTeams:"));
      for (const team of teams.nodes) {
        console.log(`  [${chalk.cyan(team.key)}] ${team.name} (${chalk.dim(team.id)})`);
        if (team.description) {
          console.log(chalk.dim(`      ${team.description}`));
        }
      }
    }
  } catch (error) {
    console.error(chalk.red("Error fetching teams:"), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function listProjects(options: { team?: string, outputFormat?: string }) {
  try {
    if (!linear) {
      throw new Error("Linear client not initialized. Check your API key.");
    }

    const outputFormat = options.outputFormat || "markdown";
    const useJson = outputFormat === "json" || outputFormat === "rich-json";

    let projects;
    if (options.team) {
      // Find team first
      const teams = await linear.teams();
      const team = teams.nodes.find(t =>
        t.key.toLowerCase() === options.team!.toLowerCase() ||
        t.name.toLowerCase() === options.team!.toLowerCase() ||
        t.id === options.team
      );

      if (!team) {
        console.error(chalk.red(`Team "${options.team}" not found.`));
        process.exit(1);
      }

      projects = await team.projects();
    } else {
      projects = await linear.projects();
    }

    if (!projects.nodes.length) {
      if (useJson) {
        console.log(JSON.stringify([], null, outputFormat === "rich-json" ? 2 : undefined));
      } else {
        console.log(chalk.yellow("No projects found."));
      }
      return;
    }

    if (useJson) {
      const projectsData = projects.nodes.map(project => ({
        id: project.id,
        name: project.name,
        description: project.description || null,
        state: project.state,
        url: project.url
      }));
      console.log(JSON.stringify(projectsData, null, outputFormat === "rich-json" ? 2 : undefined));
    } else {
      console.log(chalk.bold("\nProjects:"));
      for (const project of projects.nodes) {
        console.log(`  ${project.name} (${chalk.dim(project.id)})`);
        if (project.description) {
          console.log(chalk.dim(`      ${project.description.substring(0, 100)}${project.description.length > 100 ? '...' : ''}`));
        }
      }
    }
  } catch (error) {
    console.error(chalk.red("Error fetching projects:"), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function listLabels(options: { team?: string, outputFormat?: string }) {
  try {
    if (!linear) {
      throw new Error("Linear client not initialized. Check your API key.");
    }

    const outputFormat = options.outputFormat || "markdown";
    const useJson = outputFormat === "json" || outputFormat === "rich-json";

    let labels;
    if (options.team) {
      // Find team first
      const teams = await linear.teams();
      const team = teams.nodes.find(t =>
        t.key.toLowerCase() === options.team!.toLowerCase() ||
        t.name.toLowerCase() === options.team!.toLowerCase() ||
        t.id === options.team
      );

      if (!team) {
        console.error(chalk.red(`Team "${options.team}" not found.`));
        process.exit(1);
      }

      labels = await team.labels();
    } else {
      labels = await linear.issueLabels();
    }

    if (!labels.nodes.length) {
      if (useJson) {
        console.log(JSON.stringify([], null, outputFormat === "rich-json" ? 2 : undefined));
      } else {
        console.log(chalk.yellow("No labels found."));
      }
      return;
    }

    if (useJson) {
      const labelsData = labels.nodes.map(label => ({
        id: label.id,
        name: label.name,
        color: label.color,
        description: label.description || null
      }));
      console.log(JSON.stringify(labelsData, null, outputFormat === "rich-json" ? 2 : undefined));
    } else {
      console.log(chalk.bold("\nLabels:"));
      for (const label of labels.nodes) {
        const colorBox = label.color ? chalk.hex(label.color)("●") : "○";
        console.log(`  ${colorBox} ${label.name} (${chalk.dim(label.id)})`);
        if (label.description) {
          console.log(chalk.dim(`      ${label.description}`));
        }
      }
    }
  } catch (error) {
    console.error(chalk.red("Error fetching labels:"), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function listStatuses(teamId: string, options: { outputFormat?: string }) {
  try {
    if (!linear) {
      throw new Error("Linear client not initialized. Check your API key.");
    }

    const outputFormat = options.outputFormat || "markdown";
    const useJson = outputFormat === "json" || outputFormat === "rich-json";

    // Find team
    const teams = await linear.teams();
    const team = teams.nodes.find(t =>
      t.key.toLowerCase() === teamId.toLowerCase() ||
      t.name.toLowerCase() === teamId.toLowerCase() ||
      t.id === teamId
    );

    if (!team) {
      console.error(chalk.red(`Team "${teamId}" not found.`));
      process.exit(1);
    }

    const states = await team.states();

    if (!states.nodes.length) {
      if (useJson) {
        console.log(JSON.stringify([], null, outputFormat === "rich-json" ? 2 : undefined));
      } else {
        console.log(chalk.yellow("No statuses found."));
      }
      return;
    }

    // Sort by position
    const sortedStates = [...states.nodes].sort((a, b) => a.position - b.position);

    if (useJson) {
      const statesData = sortedStates.map(state => ({
        id: state.id,
        name: state.name,
        type: state.type,
        color: state.color,
        position: state.position
      }));
      console.log(JSON.stringify(statesData, null, outputFormat === "rich-json" ? 2 : undefined));
    } else {
      console.log(chalk.bold(`\nStatuses for ${team.name}:`));
      for (const state of sortedStates) {
        const colorBox = state.color ? chalk.hex(state.color)("●") : "○";
        console.log(`  ${colorBox} ${state.name} [${chalk.dim(state.type)}] (${chalk.dim(state.id)})`);
      }
    }
  } catch (error) {
    console.error(chalk.red("Error fetching statuses:"), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function createIssue(options: {
  title: string,
  team: string,
  description?: string,
  project?: string,
  priority?: string,
  state?: string,
  assignee?: string,
  labels?: string,
  parentId?: string,
  outputFormat?: string
}) {
  try {
    if (!linear) {
      throw new Error("Linear client not initialized. Check your API key.");
    }

    const outputFormat = options.outputFormat || "markdown";
    const useJson = outputFormat === "json" || outputFormat === "rich-json";

    // Find team
    const teams = await linear.teams();
    const team = teams.nodes.find(t =>
      t.key.toLowerCase() === options.team.toLowerCase() ||
      t.name.toLowerCase() === options.team.toLowerCase() ||
      t.id === options.team
    );

    if (!team) {
      console.error(chalk.red(`Team "${options.team}" not found.`));
      console.log(chalk.yellow("\nAvailable teams:"));
      teams.nodes.forEach(t => console.log(`  [${t.key}] ${t.name}`));
      process.exit(1);
    }

    // Build issue input
    const issueInput: any = {
      title: options.title,
      teamId: team.id,
    };

    if (options.description) {
      issueInput.description = options.description;
    }

    // Find project if specified
    if (options.project) {
      const projects = await team.projects();
      const project = projects.nodes.find(p =>
        p.name.toLowerCase() === options.project!.toLowerCase() ||
        p.id === options.project
      );

      if (!project) {
        console.error(chalk.red(`Project "${options.project}" not found.`));
        console.log(chalk.yellow("\nAvailable projects:"));
        projects.nodes.forEach(p => console.log(`  ${p.name}`));
        process.exit(1);
      }
      issueInput.projectId = project.id;
    }

    // Set priority if specified (0=none, 1=urgent, 2=high, 3=normal, 4=low)
    if (options.priority) {
      const priorityMap: Record<string, number> = {
        'none': 0, '0': 0,
        'urgent': 1, '1': 1,
        'high': 2, '2': 2,
        'normal': 3, 'medium': 3, '3': 3,
        'low': 4, '4': 4
      };
      const priority = priorityMap[options.priority.toLowerCase()];
      if (priority === undefined) {
        console.error(chalk.red(`Invalid priority "${options.priority}". Use: none, urgent, high, normal/medium, low (or 0-4)`));
        process.exit(1);
      }
      issueInput.priority = priority;
    }

    // Find state if specified
    if (options.state) {
      const states = await team.states();
      const state = states.nodes.find(s =>
        s.name.toLowerCase() === options.state!.toLowerCase() ||
        s.id === options.state
      );

      if (!state) {
        console.error(chalk.red(`State "${options.state}" not found.`));
        console.log(chalk.yellow("\nAvailable states:"));
        states.nodes.forEach(s => console.log(`  ${s.name}`));
        process.exit(1);
      }
      issueInput.stateId = state.id;
    }

    // Find assignee if specified
    if (options.assignee) {
      let assigneeId: string;

      if (options.assignee.toLowerCase() === 'me') {
        const viewer = await linear.viewer;
        assigneeId = viewer.id;
      } else {
        const users = await linear.users();
        const user = users.nodes.find(u =>
          u.name.toLowerCase() === options.assignee!.toLowerCase() ||
          u.email.toLowerCase() === options.assignee!.toLowerCase() ||
          u.displayName.toLowerCase() === options.assignee!.toLowerCase() ||
          u.id === options.assignee
        );

        if (!user) {
          console.error(chalk.red(`User "${options.assignee}" not found.`));
          process.exit(1);
        }
        assigneeId = user.id;
      }
      issueInput.assigneeId = assigneeId;
    }

    // Handle labels (comma-separated)
    if (options.labels) {
      const labelNames = options.labels.split(',').map(l => l.trim());
      const allLabels = await linear.issueLabels();
      const teamLabels = await team.labels();
      const combinedLabels = [...allLabels.nodes, ...teamLabels.nodes];

      const labelIds: string[] = [];
      for (const labelName of labelNames) {
        const label = combinedLabels.find(l =>
          l.name.toLowerCase() === labelName.toLowerCase() ||
          l.id === labelName
        );

        if (!label) {
          console.error(chalk.red(`Label "${labelName}" not found.`));
          process.exit(1);
        }
        if (!labelIds.includes(label.id)) {
          labelIds.push(label.id);
        }
      }
      issueInput.labelIds = labelIds;
    }

    // Set parent if specified
    if (options.parentId) {
      // Validate parent issue exists
      const parentIssue = await linear.issue(options.parentId.toUpperCase());
      if (!parentIssue) {
        console.error(chalk.red(`Parent issue "${options.parentId}" not found.`));
        process.exit(1);
      }
      issueInput.parentId = parentIssue.id;
    }

    // Create the issue
    const result = await linear.createIssue(issueInput);

    if (!result.success) {
      console.error(chalk.red("Failed to create issue."));
      process.exit(1);
    }

    const issue = await result.issue;
    if (!issue) {
      console.error(chalk.red("Issue created but could not fetch details."));
      process.exit(1);
    }

    if (useJson) {
      const issueData = {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        branchName: issue.branchName
      };
      console.log(JSON.stringify(issueData, null, outputFormat === "rich-json" ? 2 : undefined));
    } else {
      console.log(chalk.green(`✓ Created issue [${issue.identifier}] ${issue.title}`));
      console.log(chalk.dim(`  URL: ${issue.url}`));
      if (issue.branchName) {
        console.log(chalk.dim(`  Branch: ${issue.branchName}`));
      }
    }
  } catch (error) {
    console.error(chalk.red("Error creating issue:"), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function updateIssue(issueId: string, options: {
  title?: string,
  description?: string,
  project?: string,
  priority?: string,
  state?: string,
  assignee?: string,
  labels?: string,
  parentId?: string,
  outputFormat?: string
}) {
  try {
    if (!linear) {
      throw new Error("Linear client not initialized. Check your API key.");
    }

    // Validate issue ID format
    if (!issueId || !/^[A-Za-z0-9]+-\d+$/i.test(issueId)) {
      console.error(chalk.red("Error: Invalid issue ID format. Expected format: ENG-123 or B2BPROD-206"));
      process.exit(1);
    }

    const normalizedId = issueId.toUpperCase();
    const outputFormat = options.outputFormat || "markdown";
    const useJson = outputFormat === "json" || outputFormat === "rich-json";

    // Fetch the issue first
    const issue = await linear.issue(normalizedId);
    if (!issue) {
      console.error(chalk.red(`Issue ${normalizedId} not found.`));
      process.exit(1);
    }

    const team = await issue.team;
    if (!team) {
      console.error(chalk.red(`Could not determine team for issue ${normalizedId}.`));
      process.exit(1);
    }

    // Build update input
    const updateInput: any = {};

    if (options.title) {
      updateInput.title = options.title;
    }

    if (options.description) {
      updateInput.description = options.description;
    }

    // Find project if specified
    if (options.project) {
      const projects = await team.projects();
      const project = projects.nodes.find(p =>
        p.name.toLowerCase() === options.project!.toLowerCase() ||
        p.id === options.project
      );

      if (!project) {
        console.error(chalk.red(`Project "${options.project}" not found.`));
        console.log(chalk.yellow("\nAvailable projects:"));
        projects.nodes.forEach(p => console.log(`  ${p.name}`));
        process.exit(1);
      }
      updateInput.projectId = project.id;
    }

    // Set priority if specified
    if (options.priority) {
      const priorityMap: Record<string, number> = {
        'none': 0, '0': 0,
        'urgent': 1, '1': 1,
        'high': 2, '2': 2,
        'normal': 3, 'medium': 3, '3': 3,
        'low': 4, '4': 4
      };
      const priority = priorityMap[options.priority.toLowerCase()];
      if (priority === undefined) {
        console.error(chalk.red(`Invalid priority "${options.priority}". Use: none, urgent, high, normal/medium, low (or 0-4)`));
        process.exit(1);
      }
      updateInput.priority = priority;
    }

    // Find state if specified
    if (options.state) {
      const states = await team.states();
      const state = states.nodes.find(s =>
        s.name.toLowerCase() === options.state!.toLowerCase() ||
        s.id === options.state
      );

      if (!state) {
        console.error(chalk.red(`State "${options.state}" not found.`));
        console.log(chalk.yellow("\nAvailable states:"));
        states.nodes.forEach(s => console.log(`  ${s.name}`));
        process.exit(1);
      }
      updateInput.stateId = state.id;
    }

    // Find assignee if specified
    if (options.assignee) {
      let assigneeId: string | null;

      if (options.assignee.toLowerCase() === 'none' || options.assignee === '') {
        assigneeId = null;
      } else if (options.assignee.toLowerCase() === 'me') {
        const viewer = await linear.viewer;
        assigneeId = viewer.id;
      } else {
        const users = await linear.users();
        const user = users.nodes.find(u =>
          u.name.toLowerCase() === options.assignee!.toLowerCase() ||
          u.email.toLowerCase() === options.assignee!.toLowerCase() ||
          u.displayName.toLowerCase() === options.assignee!.toLowerCase() ||
          u.id === options.assignee
        );

        if (!user) {
          console.error(chalk.red(`User "${options.assignee}" not found.`));
          process.exit(1);
        }
        assigneeId = user.id;
      }
      updateInput.assigneeId = assigneeId;
    }

    // Handle labels (comma-separated) - replaces all labels
    if (options.labels !== undefined) {
      if (options.labels === '' || options.labels.toLowerCase() === 'none') {
        updateInput.labelIds = [];
      } else {
        const labelNames = options.labels.split(',').map(l => l.trim());
        const allLabels = await linear.issueLabels();
        const teamLabels = await team.labels();
        const combinedLabels = [...allLabels.nodes, ...teamLabels.nodes];

        const labelIds: string[] = [];
        for (const labelName of labelNames) {
          const label = combinedLabels.find(l =>
            l.name.toLowerCase() === labelName.toLowerCase() ||
            l.id === labelName
          );

          if (!label) {
            console.error(chalk.red(`Label "${labelName}" not found.`));
            process.exit(1);
          }
          if (!labelIds.includes(label.id)) {
            labelIds.push(label.id);
          }
        }
        updateInput.labelIds = labelIds;
      }
    }

    // Set parent if specified
    if (options.parentId !== undefined) {
      if (options.parentId === '' || options.parentId.toLowerCase() === 'none') {
        updateInput.parentId = null;
      } else {
        const parentIssue = await linear.issue(options.parentId.toUpperCase());
        if (!parentIssue) {
          console.error(chalk.red(`Parent issue "${options.parentId}" not found.`));
          process.exit(1);
        }
        updateInput.parentId = parentIssue.id;
      }
    }

    // Check if there's anything to update
    if (Object.keys(updateInput).length === 0) {
      console.error(chalk.red("No update options specified. Use --help to see available options."));
      process.exit(1);
    }

    // Update the issue
    const result = await linear.updateIssue(normalizedId, updateInput);

    if (!result.success) {
      console.error(chalk.red(`Failed to update issue ${normalizedId}.`));
      process.exit(1);
    }

    const updatedIssue = await result.issue;

    if (useJson) {
      const issueData = {
        id: updatedIssue?.id,
        identifier: updatedIssue?.identifier,
        title: updatedIssue?.title,
        url: updatedIssue?.url
      };
      console.log(JSON.stringify(issueData, null, outputFormat === "rich-json" ? 2 : undefined));
    } else {
      console.log(chalk.green(`✓ Updated issue ${normalizedId}`));

      // Show what was updated
      const updates: string[] = [];
      if (options.title) updates.push(`title`);
      if (options.description) updates.push(`description`);
      if (options.project) updates.push(`project`);
      if (options.priority) updates.push(`priority`);
      if (options.state) updates.push(`state`);
      if (options.assignee) updates.push(`assignee`);
      if (options.labels !== undefined) updates.push(`labels`);
      if (options.parentId !== undefined) updates.push(`parent`);

      if (updates.length > 0) {
        console.log(chalk.dim(`  Updated: ${updates.join(', ')}`));
      }
    }
  } catch (error) {
    console.error(chalk.red("Error updating issue:"), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function listIssuesV2(options: {
  maxIssues?: string,
  status?: string,
  size?: string,
  assignee?: string,
  project?: string,
  sortAsc?: boolean,
  outputFormat?: string,
  fields?: string,
  idsOnly?: boolean
}) {
  try {
    if (!linear) {
      throw new Error("Linear client not initialized. Check your API key.");
    }

    const limit = parseInt(options.maxIssues || "10", 10);
    const outputFormat = options.outputFormat || "markdown";
    const idsOnly = options.idsOnly || false;
    const useCompactJson = outputFormat === "json";
    const usePrettyJson = outputFormat === "rich-json";

    // Check if --fields was explicitly provided by user (not just the default)
    // We detect this by checking if the value differs from the default
    const defaultFields = "identifier,title,branch";
    const fieldsExplicitlyProvided = options.fields && options.fields !== defaultFields;

    // Validate mutually exclusive options
    if (idsOnly && fieldsExplicitlyProvided) {
      console.error(chalk.red("Error: --ids-only and --fields cannot be used together"));
      process.exit(1);
    }

    const requestedFields = idsOnly
      ? ["identifier"]
      : options.fields
        ? options.fields.split(',').map(f => f.trim())
        : ["identifier", "title", "branch"];

    // Build filter conditions
    const filterConditions: any[] = [];

    // Handle assignee filter
    if (options.assignee) {
      const assigneeValue = options.assignee.trim();

      // Fetch all users to find the matching one
      const users = await linear.users();
      const matchingUser = users.nodes.find(user =>
        user.name.toLowerCase() === assigneeValue.toLowerCase() ||
        user.email.toLowerCase() === assigneeValue.toLowerCase() ||
        user.displayName.toLowerCase() === assigneeValue.toLowerCase()
      );

      if (!matchingUser) {
        console.error(chalk.red(`Error: No user found matching "${assigneeValue}"`));
        process.exit(1);
      }

      filterConditions.push({
        assignee: { id: { eq: matchingUser.id } }
      });
    }

    // Handle project filter
    if (options.project) {
      const projectValue = options.project.trim();

      // Fetch all projects to find the matching one
      const projects = await linear.projects();
      const matchingProject = projects.nodes.find(project =>
        project.name.toLowerCase() === projectValue.toLowerCase() ||
        project.id === projectValue
      );

      if (!matchingProject) {
        console.error(chalk.red(`Error: No project found matching "${projectValue}"`));
        console.log(chalk.yellow("\nAvailable projects:"));
        projects.nodes.forEach(p => console.log(`  ${p.name}`));
        process.exit(1);
      }

      filterConditions.push({
        project: { id: { eq: matchingProject.id } }
      });
    }

    // Handle status filter (comma-separated values)
    if (options.status) {
      const statuses = options.status.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      if (statuses.length === 1) {
        filterConditions.push({
          state: { name: { eq: statuses[0] } }
        });
      } else {
        filterConditions.push({
          or: statuses.map(status => ({
            state: { name: { eq: status } }
          }))
        });
      }
    }

    // Handle issue size filter (comma-separated numbers)
    if (options.size) {
      const sizes = options.size.split(',').map(s => parseInt(s.trim(), 10));
      if (sizes.length === 1) {
        filterConditions.push({
          estimate: { eq: sizes[0] }
        });
      } else {
        filterConditions.push({
          or: sizes.map(size => ({
            estimate: { eq: size }
          }))
        });
      }
    }

    // Construct the final filter
    const filter = filterConditions.length > 0
      ? { and: filterConditions }
      : undefined;

    // Fetch issues with sorting
    const queryOptions: any = {
      first: limit,
      filter,
    };

    if (options.sortAsc) {
      queryOptions.orderBy = "updatedAt";
    }

    const result = await linear.issues(queryOptions);

    if (!result.nodes.length) {
      if (useCompactJson || usePrettyJson) {
        console.log(JSON.stringify([], null, usePrettyJson ? 2 : undefined));
      } else {
        console.log(chalk.yellow("No issues found matching the criteria."));
      }
      return;
    }

    // Handle ids-only mode
    if (idsOnly) {
      const ids = result.nodes.map(issue => issue.identifier);
      if (useCompactJson || usePrettyJson) {
        console.log(JSON.stringify(ids, null, usePrettyJson ? 2 : undefined));
      } else {
        // Markdown/plain format - one ID per line
        ids.forEach(id => console.log(id));
      }
      return;
    }

    // Collect all issue data
    const issuesData = [];
    for (const issue of result.nodes) {
      const issueData: any = {};

      if (requestedFields.includes("identifier")) {
        issueData.identifier = issue.identifier;
      }

      if (requestedFields.includes("title")) {
        issueData.title = issue.title;
      }

      if (requestedFields.includes("branch")) {
        issueData.branch = issue.branchName || null;
      }

      if (requestedFields.includes("description")) {
        issueData.description = issue.description || null;
      }

      if (requestedFields.includes("assignee")) {
        const assignee = await issue.assignee;
        issueData.assignee = assignee?.name || null;
      }

      if (requestedFields.includes("comments")) {
        const comments = await issue.comments();
        issueData.comments = [];

        for (const comment of comments.nodes) {
          let commentUser;
          try {
            commentUser = await comment.user;
          } catch (error) {
            commentUser = null;
          }

          issueData.comments.push({
            author: commentUser?.name || "Unknown",
            body: comment.body,
            createdAt: comment.createdAt
          });
        }
      }

      // Always fetch state and assignee for markdown format
      const state = await issue.state;
      const assignee = await issue.assignee;

      issueData._state = state?.name || "Unknown";
      issueData._estimate = issue.estimate || null;
      issueData._assignee = assignee?.name || null;

      issuesData.push(issueData);
    }

    // Output based on format
    if (useCompactJson || usePrettyJson) {
      // For JSON, remove the internal fields and output clean JSON
      const cleanedData = issuesData.map(issue => {
        const cleaned: any = {};
        for (const key of Object.keys(issue)) {
          if (!key.startsWith('_')) {
            cleaned[key] = issue[key];
          }
        }
        return cleaned;
      });
      console.log(JSON.stringify(cleanedData, null, usePrettyJson ? 2 : undefined));
    } else {
      // Markdown format
      console.log(chalk.bold(`\nFound ${issuesData.length} issue${issuesData.length > 1 ? 's' : ''}:`));

      for (const issue of issuesData) {
        console.log("");

        if (requestedFields.includes("identifier") && requestedFields.includes("title")) {
          console.log(`[${chalk.cyan(issue.identifier)}] ${issue.title}`);
        } else if (requestedFields.includes("identifier")) {
          console.log(`[${chalk.cyan(issue.identifier)}]`);
        } else if (requestedFields.includes("title")) {
          console.log(issue.title);
        }

        console.log(chalk.dim(`  Status: ${issue._state}`));

        if (issue._estimate) {
          console.log(chalk.dim(`  Size: ${issue._estimate}`));
        }

        if (requestedFields.includes("assignee") && issue.assignee) {
          console.log(chalk.dim(`  Assignee: ${issue.assignee}`));
        } else if (issue._assignee) {
          console.log(chalk.dim(`  Assignee: ${issue._assignee}`));
        }

        if (requestedFields.includes("branch") && issue.branch) {
          console.log(chalk.dim(`  Branch: ${issue.branch}`));
        }

        if (requestedFields.includes("description") && issue.description) {
          console.log(chalk.bold("\n  Description:"));
          console.log("  " + issue.description.split('\n').join('\n  '));
        }

        if (requestedFields.includes("comments") && issue.comments && issue.comments.length > 0) {
          console.log(chalk.bold("\n  Comments:"));
          for (const comment of issue.comments) {
            const commentDate = new Date(comment.createdAt);
            const dateStr = commentDate.toISOString().split("T")[0];
            const timeStr = commentDate.toTimeString().split(" ")[0];
            console.log(chalk.dim(`  [${dateStr} ${timeStr}] ${comment.author}:`));
            console.log("  " + comment.body.split('\n').join('\n  '));
            console.log("");
          }
        }
      }

      // Show pagination info if there are more issues
      if (result.pageInfo.hasNextPage) {
        console.log(chalk.dim(`\nShowing first ${limit} issues. There may be more issues available.`));
      }
    }
  } catch (error) {
    console.error(chalk.red("Error fetching issues:"), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Set up CLI commands
const program = new Command();

program
  .name("linear")
  .description("Command line interface for Linear")
  .version("1.0.0")
  .enablePositionalOptions()
  .showHelpAfterError();

program
  .command("my-issues")
  .description("List your assigned issues")
  .action(listIssues);

program
  .command("get-issue [id]")
  .description("Show issue details and comments (ID optional if in git branch)")
  .action(getIssue);

program
  .command("get-issue-v2 <id>")
  .description("Get a single issue with the same output format and field options as list-issues")
  .option("--output-format <format>", "Output format: markdown, json (compact), or rich-json (pretty)", "json")
  .option("--fields <fields>", "Comma-separated fields to include: identifier,title,branch,assignee,description,comments,parents", "identifier,title,branch")
  .action(getIssueV2);

program
  .command("add-comment <message>")
  .description("Add a comment to an issue (auto-detects issue ID from git branch)")
  .option("-i, --issue-id <id>", "Specify the Linear issue ID manually")
  .action(addComment);

program
  .command("fetch-images <id>")
  .description("Download all images from a Linear issue to thoughts/shared/images/")
  .action(fetchImages);

program
  .command("update-status <id> <status>")
  .description("Update the status of a Linear issue (e.g. 'research needed', 'in review')")
  .action(updateStatus);

program
  .command("add-link <id> <url>")
  .description("Add a link/attachment to a Linear issue")
  .option("-t, --title <title>", "Optional title for the link (defaults to URL)")
  .action(addLink);

program
  .command("assign-to-me [id]")
  .description("Assign an issue to yourself (ID optional if in git branch)")
  .action(assignToMe);

program
  .command("list-issues")
  .description("List and filter issues with advanced options")
  .option("--max-issues <number>", "Maximum number of issues to fetch", "10")
  .option("--assignee <assignee>", "Filter by assignee (name, email, or display name)")
  .option("--project <project>", "Filter by project (name or ID)")
  .option("--status <statuses>", "Filter by status (comma-separated, e.g. 'research needed,in review')")
  .option("--size <sizes>", "Filter by issue size (comma-separated numbers, e.g. '1,2')")
  .option("--sort-asc", "Sort by updatedAt in ascending order (default is descending)")
  .option("--output-format <format>", "Output format: markdown, json (compact), or rich-json (pretty)", "markdown")
  .option("--fields <fields>", "Comma-separated fields to include: identifier,title,branch,assignee,description,comments", "identifier,title,branch")
  .option("--ids-only", "Output only issue identifiers (incompatible with --fields)")
  .action(listIssuesV2);

program
  .command("list-teams")
  .description("List all teams in the workspace")
  .option("--output-format <format>", "Output format: markdown, json (compact), or rich-json (pretty)", "markdown")
  .action(listTeams);

program
  .command("list-projects")
  .description("List projects in the workspace")
  .option("--team <team>", "Filter by team (name, key, or ID)")
  .option("--output-format <format>", "Output format: markdown, json (compact), or rich-json (pretty)", "markdown")
  .action(listProjects);

program
  .command("list-labels")
  .description("List issue labels in the workspace")
  .option("--team <team>", "Filter by team (name, key, or ID)")
  .option("--output-format <format>", "Output format: markdown, json (compact), or rich-json (pretty)", "markdown")
  .action(listLabels);

program
  .command("list-statuses <team>")
  .description("List workflow statuses for a team")
  .option("--output-format <format>", "Output format: markdown, json (compact), or rich-json (pretty)", "markdown")
  .action(listStatuses);

program
  .command("create-issue")
  .description("Create a new Linear issue")
  .requiredOption("-t, --title <title>", "Issue title (required)")
  .requiredOption("--team <team>", "Team name, key, or ID (required)")
  .option("-d, --description <description>", "Issue description (markdown)")
  .option("-p, --project <project>", "Project name or ID")
  .option("--priority <priority>", "Priority: none, urgent, high, normal/medium, low (or 0-4)")
  .option("-s, --state <state>", "Initial state/status name or ID")
  .option("-a, --assignee <assignee>", "Assignee (name, email, or 'me')")
  .option("-l, --labels <labels>", "Comma-separated label names or IDs")
  .option("--parent-id <parentId>", "Parent issue ID for sub-issues")
  .option("--output-format <format>", "Output format: markdown, json (compact), or rich-json (pretty)", "markdown")
  .action(createIssue);

program
  .command("update-issue <id>")
  .description("Update an existing Linear issue")
  .option("-t, --title <title>", "New issue title")
  .option("-d, --description <description>", "New issue description (markdown)")
  .option("-p, --project <project>", "Project name or ID")
  .option("--priority <priority>", "Priority: none, urgent, high, normal/medium, low (or 0-4)")
  .option("-s, --state <state>", "State/status name or ID")
  .option("-a, --assignee <assignee>", "Assignee (name, email, 'me', or 'none' to unassign)")
  .option("-l, --labels <labels>", "Comma-separated label names (replaces all labels, use 'none' to clear)")
  .option("--parent-id <parentId>", "Parent issue ID (or 'none' to remove parent)")
  .option("--output-format <format>", "Output format: markdown, json (compact), or rich-json (pretty)", "markdown")
  .action(updateIssue);

// Add completion generation
program
  .command("completion")
  .description("Generate shell completion script")
  .option("--bash", "Generate Bash completion script")
  .option("--zsh", "Generate Zsh completion script")
  .option("--fish", "Generate Fish completion script")
  .action((options) => {
    const commands = ["my-issues", "list-issues", "list-teams", "list-projects", "list-labels", "list-statuses", "get-issue", "get-issue-v2", "add-comment", "fetch-images", "update-status", "add-link", "assign-to-me", "create-issue", "update-issue", "completion", "help"];

    if (options.bash) {
      // Basic bash completion
      console.log(`#!/usr/bin/env bash
# Bash completion for linear CLI

_linear_completions() {
  local cur prev commands
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  commands="${commands.join(' ')}"

  if [ \$COMP_CWORD -eq 1 ]; then
    COMPREPLY=( \$(compgen -W "\$commands" -- \$cur) )
  elif [ "\$prev" = "add-comment" ] && [ \$COMP_CWORD -eq 2 ]; then
    COMPREPLY=( \$(compgen -W "--issue-id -i" -- \$cur) )
  fi

  return 0
}

complete -F _linear_completions linear`);
    } else if (options.zsh) {
      // Basic zsh completion
      console.log(`#compdef linear

_linear() {
  local -a commands
  commands=(
    'my-issues:List your assigned issues'
    'list-issues:List and filter issues with advanced options'
    'list-teams:List all teams in the workspace'
    'list-projects:List projects in the workspace'
    'list-labels:List issue labels in the workspace'
    'list-statuses:List workflow statuses for a team'
    'get-issue:Show issue details and comments'
    'get-issue-v2:Get a single issue with the same output format as list-issues'
    'add-comment:Add a comment to an issue'
    'fetch-images:Download all images from an issue'
    'update-status:Update the status of a Linear issue'
    'add-link:Add a link/attachment to a Linear issue'
    'assign-to-me:Assign an issue to yourself'
    'create-issue:Create a new Linear issue'
    'update-issue:Update an existing Linear issue'
    'completion:Generate shell completion script'
    'help:Display help for command'
  )

  if (( CURRENT == 2 )); then
    _describe 'command' commands
  elif (( CURRENT == 3 )); then
    case \$words[2] in
      add-comment)
        _arguments \\
          '-i[Specify the Linear issue ID manually]' \\
          '--issue-id[Specify the Linear issue ID manually]'
        ;;
      add-link)
        _arguments \\
          '-t[Optional title for the link]:title:' \\
          '--title[Optional title for the link]:title:'
        ;;
      get-issue-v2)
        _arguments \\
          '--output-format[Output format]:format:(markdown json rich-json)' \\
          '--fields[Fields to include]:fields:'
        ;;
      list-issues)
        _arguments \\
          '--max-issues[Maximum number of issues to fetch]:number:' \\
          '--assignee[Filter by assignee]:assignee:' \\
          '--project[Filter by project]:project:' \\
          '--status[Filter by status]:statuses:' \\
          '--size[Filter by issue size]:sizes:' \\
          '--sort-asc[Sort by updatedAt in ascending order]' \\
          '--output-format[Output format]:format:(markdown json rich-json)' \\
          '--fields[Fields to include]:fields:' \\
          '--ids-only[Output only issue identifiers]'
        ;;
    esac
  fi
}

_linear`);
    } else if (options.fish) {
      // Basic fish completion
      console.log(`# Fish completion for linear CLI

complete -c linear -f

# Commands
complete -c linear -n "__fish_use_subcommand" -a "my-issues" -d "List your assigned issues"
complete -c linear -n "__fish_use_subcommand" -a "list-issues" -d "List and filter issues with advanced options"
complete -c linear -n "__fish_use_subcommand" -a "list-teams" -d "List all teams in the workspace"
complete -c linear -n "__fish_use_subcommand" -a "list-projects" -d "List projects in the workspace"
complete -c linear -n "__fish_use_subcommand" -a "list-labels" -d "List issue labels in the workspace"
complete -c linear -n "__fish_use_subcommand" -a "list-statuses" -d "List workflow statuses for a team"
complete -c linear -n "__fish_use_subcommand" -a "get-issue" -d "Show issue details and comments"
complete -c linear -n "__fish_use_subcommand" -a "get-issue-v2" -d "Get a single issue with the same output format as list-issues"
complete -c linear -n "__fish_use_subcommand" -a "add-comment" -d "Add a comment to an issue"
complete -c linear -n "__fish_use_subcommand" -a "fetch-images" -d "Download all images from an issue"
complete -c linear -n "__fish_use_subcommand" -a "update-status" -d "Update the status of a Linear issue"
complete -c linear -n "__fish_use_subcommand" -a "add-link" -d "Add a link/attachment to a Linear issue"
complete -c linear -n "__fish_use_subcommand" -a "assign-to-me" -d "Assign an issue to yourself"
complete -c linear -n "__fish_use_subcommand" -a "create-issue" -d "Create a new Linear issue"
complete -c linear -n "__fish_use_subcommand" -a "update-issue" -d "Update an existing Linear issue"
complete -c linear -n "__fish_use_subcommand" -a "completion" -d "Generate shell completion script"
complete -c linear -n "__fish_use_subcommand" -a "help" -d "Display help for command"

# Options for add-comment
complete -c linear -n "__fish_seen_subcommand_from add-comment" -s i -l issue-id -d "Specify the Linear issue ID manually"

# Options for add-link
complete -c linear -n "__fish_seen_subcommand_from add-link" -s t -l title -d "Optional title for the link"

# Options for get-issue-v2
complete -c linear -n "__fish_seen_subcommand_from get-issue-v2" -l output-format -d "Output format" -a "markdown json rich-json"
complete -c linear -n "__fish_seen_subcommand_from get-issue-v2" -l fields -d "Fields to include (comma-separated)"

# Options for list-issues
complete -c linear -n "__fish_seen_subcommand_from list-issues" -l max-issues -d "Maximum number of issues to fetch"
complete -c linear -n "__fish_seen_subcommand_from list-issues" -l assignee -d "Filter by assignee (name, email, or display name)"
complete -c linear -n "__fish_seen_subcommand_from list-issues" -l project -d "Filter by project (name or ID)"
complete -c linear -n "__fish_seen_subcommand_from list-issues" -l status -d "Filter by status (comma-separated)"
complete -c linear -n "__fish_seen_subcommand_from list-issues" -l size -d "Filter by issue size (comma-separated)"
complete -c linear -n "__fish_seen_subcommand_from list-issues" -l sort-asc -d "Sort by updatedAt in ascending order"
complete -c linear -n "__fish_seen_subcommand_from list-issues" -l output-format -d "Output format" -a "markdown json rich-json"
complete -c linear -n "__fish_seen_subcommand_from list-issues" -l fields -d "Fields to include (comma-separated)"
complete -c linear -n "__fish_seen_subcommand_from list-issues" -l ids-only -d "Output only issue identifiers"

# Options for list-teams, list-projects, list-labels, list-statuses
complete -c linear -n "__fish_seen_subcommand_from list-teams list-projects list-labels list-statuses" -l output-format -d "Output format" -a "markdown json rich-json"
complete -c linear -n "__fish_seen_subcommand_from list-projects list-labels" -l team -d "Filter by team (name, key, or ID)"

# Options for create-issue
complete -c linear -n "__fish_seen_subcommand_from create-issue" -s t -l title -d "Issue title (required)"
complete -c linear -n "__fish_seen_subcommand_from create-issue" -l team -d "Team name, key, or ID (required)"
complete -c linear -n "__fish_seen_subcommand_from create-issue" -s d -l description -d "Issue description (markdown)"
complete -c linear -n "__fish_seen_subcommand_from create-issue" -s p -l project -d "Project name or ID"
complete -c linear -n "__fish_seen_subcommand_from create-issue" -l priority -d "Priority" -a "none urgent high normal medium low"
complete -c linear -n "__fish_seen_subcommand_from create-issue" -s s -l state -d "Initial state/status"
complete -c linear -n "__fish_seen_subcommand_from create-issue" -s a -l assignee -d "Assignee (name, email, or 'me')"
complete -c linear -n "__fish_seen_subcommand_from create-issue" -s l -l labels -d "Comma-separated label names"
complete -c linear -n "__fish_seen_subcommand_from create-issue" -l parent-id -d "Parent issue ID for sub-issues"
complete -c linear -n "__fish_seen_subcommand_from create-issue" -l output-format -d "Output format" -a "markdown json rich-json"

# Options for update-issue
complete -c linear -n "__fish_seen_subcommand_from update-issue" -s t -l title -d "New issue title"
complete -c linear -n "__fish_seen_subcommand_from update-issue" -s d -l description -d "New issue description (markdown)"
complete -c linear -n "__fish_seen_subcommand_from update-issue" -s p -l project -d "Project name or ID"
complete -c linear -n "__fish_seen_subcommand_from update-issue" -l priority -d "Priority" -a "none urgent high normal medium low"
complete -c linear -n "__fish_seen_subcommand_from update-issue" -s s -l state -d "State/status"
complete -c linear -n "__fish_seen_subcommand_from update-issue" -s a -l assignee -d "Assignee (name, email, 'me', or 'none')"
complete -c linear -n "__fish_seen_subcommand_from update-issue" -s l -l labels -d "Comma-separated label names"
complete -c linear -n "__fish_seen_subcommand_from update-issue" -l parent-id -d "Parent issue ID (or 'none')"
complete -c linear -n "__fish_seen_subcommand_from update-issue" -l output-format -d "Output format" -a "markdown json rich-json"

# Options for completion
complete -c linear -n "__fish_seen_subcommand_from completion" -l bash -d "Generate Bash completion script"
complete -c linear -n "__fish_seen_subcommand_from completion" -l zsh -d "Generate Zsh completion script"
complete -c linear -n "__fish_seen_subcommand_from completion" -l fish -d "Generate Fish completion script"`);
    } else {
      console.error(chalk.red("Please specify a shell: --bash, --zsh, or --fish"));
      process.exit(1);
    }
  });

// Parse and execute
program.parse(process.argv);

// Show help if no command is provided
if (process.argv.length <= 2) {
  program.help();
}