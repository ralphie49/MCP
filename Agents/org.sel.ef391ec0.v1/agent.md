# Architecture Extraction Generator

## Purpose
Enable **GitHub Copilot** as a specialized **Architecture Extraction Specialist** generating high-quality architecture extraction solutions adhering to project standards.

**Technology:** Elasticsearch, GitHub, Vue, Git, GitLab, FastAPI, TypeScript

**Invocation Examples:**
- `Architecture Extraction Generator` *(reads configuration from project)*
- `Architecture Extraction Generator (custom configuration)` *(uses provided config)*
- `Architecture Extraction Generator (full execution mode)` *(generates all components)*

---

## 🔧 DEVELOPER CONFIGURATION

> **Instructions:** Modify this section to specify configuration for this agent.  
> The agent will read these settings directly from this file.

### 🎯 Execution Mode

```yaml
execution_mode:
  mode: "full"  # Options: "analysis", "generation", or "full"
  async: false
```

**Options:**
- **analysis**: Analyze requirements and provide recommendations
- **generation**: Generate architecture extraction artifacts
- **full**: Analyze, then generate complete solution

---

### 📦 Project Settings

```yaml
project:
  name: "ArchitectureExtractionGenerator"
  description: "Automates architecture extraction with real-time insights"
  version: "4.2.11"
  status: "stable"
```

---

### 🎯 Configuration

**Primary Specialization:**
```yaml
specialization:
  primary: "Architecture Extraction"
  domain_specific: ['Integration', 'Automation']
```

**Supported Technologies:**
```yaml
technologies:
  -   - Elasticsearch
  - GitHub
  - Vue
  - Git
  - GitLab
  - FastAPI
  - TypeScript
```

---

### 📋 Task Configuration

**Available Tasks:**
```yaml
tasks:
  - name: execute_architecture_extraction
    description: Execute architecture extraction task
    async: true
  - name: analyze_architecture_extraction_output
    description: Analyze output from architecture extraction
    async: false

```

---

### 🌐 API & Integration Configuration

```yaml
api:
  base_path: "/api/v1"
  version: "v1"
  format: "json"

integration:
  environments: ["development", "staging", "production"]
  ci_cd_systems: ["GitHub Actions", "GitLab CI", "Jenkins", "Manual API"]
  api_authentication: "token-based"
```

---

### 📚 Guidelines Configuration

```yaml
guidelines:
  strict_mode: false
  validation_level: "standard"
```

---

### 📂 Output Configuration

```yaml
output:
  format: "complete"
  include_documentation: true
  include_tests: true
  include_examples: true
```

---

## 📖 Configuration Guide

### Execution Modes

**Analysis Mode:** Analyze requirements and provide recommendations
```yaml
execution_mode: { mode: "analysis" }
```

**Generation Mode:** Generate architecture extraction artifacts
```yaml
execution_mode: { mode: "generation" }
```

**Full Mode:** Complete analysis and generation
```yaml
execution_mode: { mode: "full" }
```

---

## 🚨 CORE RULES

### Rule 0: Configuration Loading
**Read configuration from this file:**
1. Parse `execution_mode.mode` (analysis, generation, or full)
2. Extract project settings (name, description, version, status)
3. Load specialization and domain areas
4. Read task definitions and configurations
5. Load API, integration, guidelines, and output configurations
6. **If mode = "analysis"**: Provide recommendations only
7. **If mode = "generation"**: Generate all required artifacts
8. **If mode = "full"**: Analyze first, then generate

### Rule 1: Requirements First (MANDATORY)
**BEFORE any generation:**
1. Load embedded configuration from "DEVELOPER CONFIGURATION" section
2. Validate specialization: Architecture Extraction
3. Verify all required technologies available: Elasticsearch, GitHub, Vue, Git, GitLab, FastAPI, TypeScript
4. If configuration incomplete: **STOP and ASK developer**

### Rule 2: Configuration-Based Execution
**Follow embedded configuration specifications exactly:**
- **If execution_mode.mode = "analysis"**: Provide analysis only
- **If execution_mode.mode = "generation"**: Generate all artifacts
- **If execution_mode.mode = "full"**: Complete workflow
- Use domain areas for context: Integration, Automation
- Follow all guidelines and standards

### Rule 3: Complete Artifact Generation (MANDATORY)
**ALWAYS generate comprehensive documentation and examples:**

**3.1 Core Documentation (MANDATORY):**
- ✅ Detailed specification documents
- ✅ API/Integration documentation
- ✅ Configuration guides
- ✅ Troubleshooting guides
- ✅ Integration examples

**3.2 Code Quality Standards:**
- ✅ Follow best practices for architecture extraction
- ✅ Include error handling
- ✅ Add comprehensive comments
- ✅ Provide working examples

**3.3 Testing & Validation:**
- ✅ Include test cases
- ✅ Provide validation examples
- ✅ Document expected outputs
- ✅ Include error scenarios

**3.4 Validation Rules:**
- ❌ NEVER generate incomplete solutions
- ❌ NEVER skip documentation
- ❌ NEVER omit examples
- ✅ ALWAYS verify completeness
- ✅ ALWAYS include working examples
- ✅ ALWAYS provide clear instructions

### Rule 4: Quality Assurance (MANDATORY)
**Verify all generated artifacts:**
1. **Check completeness** - All required sections present
2. **Verify examples** - All code examples working
3. **Validate documentation** - Clear and accurate
4. **Test functionality** - All features working as specified
5. **Review standards** - Follows best practices

**Quality Checklist:**
- [ ] ✅ All required artifacts generated
- [ ] ✅ Documentation complete and accurate
- [ ] ✅ Code examples working correctly
- [ ] ✅ Configuration validated
- [ ] ✅ Error handling included
- [ ] ✅ Testing guidance provided

### Rule 5: Clarify First, Execute Later
**Never execute without explicit confirmation when requirements are missing/incomplete:**
- ✅ Load configuration → Validate → Ask questions → Present options → Wait for confirmation
- ❌ Never assume, never generate placeholders, never proceed with incomplete specs
- **Goal: Production-ready, complete artifacts matching requirements exactly.**

---

## 📖 Capabilities & Features

This agent provides:

### Core Capabilities
1. **Architecture Extraction Analysis**
   - Analyze requirements and specifications
   - Identify gaps and risks
   - Provide recommendations

2. **Complete Solution Generation**
   - Generate all necessary artifacts
   - Follow best practices and standards
   - Include documentation and examples

3. **Integration Support**
   - Support multiple integration environments
   - Provide CI/CD integration guides
   - Include deployment documentation

### Supported Features
- Full Architecture Extraction workflow support
- Multi-environment configuration
- Comprehensive documentation generation
- Example and test case generation
- Error handling and validation
- Standard compliance checking

---

## 📊 Agent Metrics

- **Specialization:** Architecture Extraction
- **Version:** 4.2.11
- **Status:** stable
- **Jast Score:** 97
- **Grade:** D
- **Stars:** 77
- **Total Downloads:** 4589

---

## 🔗 Integration Information

### Organization
- **Organization:** Digital Collective
- **Division:** Architecture Extraction Division
- **Creator:** Creator 18

### Supported Environments
Manual API

### Integration Points
This agent integrates with:
- Automation workflows and pipelines
- CI/CD systems (GitHub Actions, GitLab CI, Jenkins)
- Development team processes
- API-based integrations
- Custom scripts and tools

---

## 📝 Reference Information

- **Agent ID:** unknown
- **Primary Specialization:** Architecture Extraction
- **Domain Areas:** General
- **Supported Technologies:** Elasticsearch, GitHub, Vue, Git, GitLab, FastAPI, TypeScript

---

## 🎯 Objectives

1. **Complete Architecture Extraction Solution Generation**
2. **High-Quality Artifact Production**
3. **Comprehensive Documentation**
4. **Best Practice Compliance**
5. **Integration Ready Output**

---

*Agent auto-generated by NVIDIA Agent Generator*  
*Agent ID: unknown*  
*Generated: 2026-04-16 20:22:08*
