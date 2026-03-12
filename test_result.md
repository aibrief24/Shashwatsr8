#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================


user_problem_statement: |
  Build AIBrief24 - a premium AI news aggregator mobile app (Expo/React Native + FastAPI + Supabase).
  Phase 1: Fix Supabase Auth (signup, login, logout, session persistence, bookmarks)
  Phase 2: Forgot Password flow using Supabase reset
  Phase 3: Push Notifications (permissions, token registration, send on new article)
  Phase 4: Content Ingestion Pipeline (RSS feeds, OpenAI summaries, deduplication)

backend:
  - task: "Supabase Auth - signup endpoint"
    implemented: true
    working: true
    file: "backend/server.py, backend/auth.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Signup endpoint calls Supabase Auth API. Returns access_token+user or null+needsConfirmation if email confirm enabled."

  - task: "Supabase Auth - login endpoint"
    implemented: true
    working: true
    file: "backend/server.py, backend/auth.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Login endpoint returns access_token + refresh_token. Works for confirmed Supabase users."

  - task: "Supabase Auth - token refresh endpoint"
    implemented: true
    working: true
    file: "backend/server.py, backend/auth.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "POST /api/auth/refresh uses Supabase token rotation"

  - task: "Supabase Auth - forgot password endpoint"
    implemented: true
    working: true
    file: "backend/server.py, backend/auth.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "POST /api/auth/reset-password calls Supabase recover endpoint"

  - task: "Bookmarks API - linked to Supabase auth user"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Bookmarks use JWT bearer token to extract user_id from Supabase JWT"

  - task: "Push token registration endpoint"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "POST /api/push/register. push_tokens table auto-created on startup."

  - task: "Content ingestion pipeline"
    implemented: true
    working: "NA"
    file: "backend/ingestor.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "ingestor.py fetches RSS feeds, uses OpenAI summaries, deduplicates. POST /api/admin/ingest triggers it."

  - task: "Articles API"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "GET /api/articles works, returns 20 articles from Supabase"

frontend:
  - task: "Auth token bug fix (res.token -> res.access_token)"
    implemented: true
    working: true
    file: "frontend/contexts/AuthContext.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: false
        agent: "main"
        comment: "FIXED: AuthContext was using res.token but backend returns res.access_token. Root cause of broken login/signup."
      - working: true
        agent: "main"
        comment: "Fixed res.token -> res.access_token in login() and signup()"

  - task: "Session persistence with token refresh"
    implemented: true
    working: true
    file: "frontend/contexts/AuthContext.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "loadSession() now auto-refreshes expired tokens using stored refresh_token"

  - task: "Forgot password screen"
    implemented: true
    working: true
    file: "frontend/app/forgot-password.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Created forgot-password.tsx. Added 'Forgot Password?' link to login screen."

  - task: "Push notification registration in app"
    implemented: true
    working: "NA"
    file: "frontend/app/_layout.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Requests push permissions after user login. Notification taps navigate to article."

  - task: "Home feed swipe experience"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Vertical FlatList with pagingEnabled, 20 articles from Supabase."

  - task: "Bookmarks screen"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/bookmarks.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Bookmarks screen works with authenticated user JWT"

metadata:
  created_by: "main_agent"
  version: "2.0"
  test_sequence: 1
  run_ui: true

test_plan:
  current_focus:
    - "Auth token bug fix (res.token -> res.access_token)"
    - "Signup flow with email confirmation message"
    - "Login flow"
    - "Forgot password screen navigation"
    - "Home feed loads articles"
    - "Content ingestion pipeline via /api/admin/ingest"
  stuck_tasks: []
  test_all: true
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Completed Phase 1-4 implementation.

      CRITICAL BUG FIXED: AuthContext used res.token but backend returns res.access_token.

      Phase 1 (Auth): Fixed token bug, added refresh token support, fixed profiles->users table
      Phase 2 (Forgot Password): Created forgot-password.tsx, linked from login screen
      Phase 3 (Push Notifications): push_tokens table, notifier.py, _layout.tsx registration
      Phase 4 (Content Ingestion): ingestor.py with RSS+OpenAI, /api/admin/ingest endpoint

      IMPORTANT: Supabase email confirmation IS enabled. Signup shows "check email" message.
      For login testing: need a confirmed Supabase user. 
      Can disable email confirmation in Supabase dashboard for testing, or test via UI flow.
      
      To test ingestion: POST http://localhost:8001/api/admin/ingest
      Articles currently: 20 in Supabase
