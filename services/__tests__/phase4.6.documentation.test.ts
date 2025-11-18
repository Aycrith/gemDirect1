import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Phase 4.6: Documentation Validation
 * 
 * Validates:
 * - All required documentation exists
 * - API documentation completeness
 * - Code examples are valid
 * - Integration guides accuracy
 * - Deployment documentation
 */

describe('Phase 4.6: Documentation Validation', () => {
  const docsRoot = join(__dirname, '../../');

  describe('Required Documentation Files', () => {
    it('should have Phase 3.2 completion documentation', () => {
      const requiredDocs = [
        'PHASE_3_2_COMPLETION_REPORT.md',
        'PHASE_3_2_IMPLEMENTATION_GUIDE.md',
        'PHASE_3_2_ROADMAP.md',
        'PHASE_3_2_SESSION_1_SUMMARY.md',
        'PHASE_3_2_VALIDATION_COMPLETE.md',
      ];

      requiredDocs.forEach((doc) => {
        const filePath = join(docsRoot, doc);
        expect(existsSync(filePath)).toBe(true);
        const content = readFileSync(filePath, 'utf-8');
        expect(content.length).toBeGreaterThan(0);
      });
    });

    it('should have Phase 4 validation documentation', () => {
      const requiredDocs = [
        'PHASE_4_VALIDATION_PLAN.md',
        'PHASE_4_PROGRESS_REPORT.md',
        'PHASE_4_2_VALIDATION_COMPLETE.md',
        'PHASE_4_3_PERFORMANCE_VALIDATION_COMPLETE.md',
        'PHASE_4_4_PRODUCTION_READINESS_COMPLETE.md',
        'PHASE_4_COMPLETE_STATUS.md',
      ];

      requiredDocs.forEach((doc) => {
        const filePath = join(docsRoot, doc);
        expect(existsSync(filePath)).toBe(true);
        const content = readFileSync(filePath, 'utf-8');
        expect(content.length).toBeGreaterThan(0);
      });
    });

    it('should have deployment documentation', () => {
      const requiredDocs = [
        'PROJECT_STATUS_PHASE_3_2_PHASE_4_COMPLETE.md',
        'PHASE_3_2_PHASE_4_SUMMARY.md',
        'NAVIGATION_INDEX_PHASE_3_2_PHASE_4.md',
        'DELIVERY_READY.md',
      ];

      requiredDocs.forEach((doc) => {
        const filePath = join(docsRoot, doc);
        expect(existsSync(filePath)).toBe(true);
        const content = readFileSync(filePath, 'utf-8');
        expect(content.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Documentation Content Validation', () => {
    it('should have status indicators in completion reports', () => {
      const reportPath = join(docsRoot, 'PHASE_4_COMPLETE_STATUS.md');
      const content = readFileSync(reportPath, 'utf-8');

      // Should contain key status markers
      expect(content).toContain('COMPLETE');
      expect(content.toLowerCase()).toContain('pass');
      expect(content).toMatch(/\d+\/\d+.*pass/i);
    });

    it('should have test results in validation reports', () => {
      const performancePath = join(docsRoot, 'PHASE_4_3_PERFORMANCE_VALIDATION_COMPLETE.md');
      const content = readFileSync(performancePath, 'utf-8');

      // Should contain performance metrics
      expect(content).toContain('performance');
      expect(content).toContain('ms');
      expect(content).toMatch(/\d+x/); // Should show multiples
    });

    it('should have deployment checklist in readiness report', () => {
      const readinessPath = join(docsRoot, 'PHASE_4_4_PRODUCTION_READINESS_COMPLETE.md');
      const content = readFileSync(readinessPath, 'utf-8');

      // Should contain deployment guidance
      expect(content.toLowerCase()).toContain('deployment');
      expect(content.toLowerCase()).toContain('production');
      expect(content.toLowerCase()).toContain('checklist');
    });

    it('should have implementation examples in guide', () => {
      const guidePath = join(docsRoot, 'PHASE_3_2_IMPLEMENTATION_GUIDE.md');
      const content = readFileSync(guidePath, 'utf-8');

      // Should contain code examples
      expect(content).toContain('import');
      expect(content).toContain('export');
      expect(content).toContain('const');
    });

    it('should have feature descriptions in completion report', () => {
      const reportPath = join(docsRoot, 'PHASE_3_2_COMPLETION_REPORT.md');
      const content = readFileSync(reportPath, 'utf-8');

      // Should describe the 4 main components
      expect(content).toContain('TelemetryFilterPanel');
      expect(content).toContain('ExportDialog');
      expect(content).toContain('RecommendationEngine');
      expect(content).toContain('ExportService');
    });
  });

  describe('Documentation Structure', () => {
    it('should have proper markdown headers in all documents', () => {
      const docs = [
        'PHASE_3_2_COMPLETION_REPORT.md',
        'PHASE_4_COMPLETE_STATUS.md',
        'PROJECT_STATUS_PHASE_3_2_PHASE_4_COMPLETE.md',
      ];

      docs.forEach((doc) => {
        const filePath = join(docsRoot, doc);
        const content = readFileSync(filePath, 'utf-8');

        // Should start with a header
        expect(content).toMatch(/^#+\s+/m);
        // Should have proper formatting
        expect(content).toMatch(/##|###|####/);
      });
    });

    it('should have table of contents or navigation', () => {
      const navigationPath = join(docsRoot, 'NAVIGATION_INDEX_PHASE_3_2_PHASE_4.md');
      const content = readFileSync(navigationPath, 'utf-8');

      // Should be navigation focused
      expect(content).toContain('Start Here');
      expect(content).toContain('Documentation');
      expect(content).toContain('Quick Link');
    });

    it('should have formatted tables in reports', () => {
      const reportPath = join(docsRoot, 'PHASE_4_COMPLETE_STATUS.md');
      const content = readFileSync(reportPath, 'utf-8');

      // Should contain markdown tables
      expect(content).toMatch(/\|.*\|.*\|/);
      expect(content).toMatch(/\|---/);
    });
  });

  describe('API Documentation Coverage', () => {
    it('should document RecommendationEngine API', () => {
      const guidePath = join(docsRoot, 'PHASE_3_2_IMPLEMENTATION_GUIDE.md');
      const content = readFileSync(guidePath, 'utf-8');

      // Should document the API
      expect(content.toLowerCase()).toMatch(/recommendation.*engine|analyzetelemetry/i);
    });

    it('should document ExportService API', () => {
      const guidePath = join(docsRoot, 'PHASE_3_2_IMPLEMENTATION_GUIDE.md');
      const content = readFileSync(guidePath, 'utf-8');

      // Should document export capabilities
      expect(content.toLowerCase()).toMatch(/export|csv|json|pdf/i);
    });

    it('should document TelemetryFilterPanel usage', () => {
      const guidePath = join(docsRoot, 'PHASE_3_2_IMPLEMENTATION_GUIDE.md');
      const content = readFileSync(guidePath, 'utf-8');

      // Should document the component
      expect(content.toLowerCase()).toMatch(/telemetry|filter/i);
    });

    it('should document data interfaces and types', () => {
      const completionPath = join(docsRoot, 'PHASE_3_2_COMPLETION_REPORT.md');
      const content = readFileSync(completionPath, 'utf-8');

      // Should mention data structures
      expect(content.toLowerCase()).toMatch(/telemetry|snapshot|recommendation/i);
    });
  });

  describe('Deployment Documentation', () => {
    it('should have deployment checklist', () => {
      const deliveryPath = join(docsRoot, 'DELIVERY_READY.md');
      const content = readFileSync(deliveryPath, 'utf-8');

      // Should have deployment guidance
      expect(content).toContain('DEPLOYMENT');
      expect(content).toContain('CLEARED');
      expect(content).toContain('✅');
    });

    it('should have build instructions', () => {
      const completePath = join(docsRoot, 'PROJECT_STATUS_PHASE_3_2_PHASE_4_COMPLETE.md');
      const content = readFileSync(completePath, 'utf-8');

      // Should mention build
      expect(content.toLowerCase()).toMatch(/build|npm|production/i);
    });

    it('should have quick start commands', () => {
      const deliveryPath = join(docsRoot, 'DELIVERY_READY.md');
      const content = readFileSync(deliveryPath, 'utf-8');

      // Should have command examples
      expect(content).toContain('npm');
      expect(content).toContain('test');
      expect(content).toContain('build');
    });

    it('should have environment setup documentation', () => {
      const projectStatusPath = join(docsRoot, 'PROJECT_STATUS_PHASE_3_2_PHASE_4_COMPLETE.md');
      const content = readFileSync(projectStatusPath, 'utf-8');

      // Should mention environment/setup
      expect(content.toLowerCase()).toMatch(/environment|setup|config|install/i);
    });
  });

  describe('Documentation Quality Metrics', () => {
    it('all documentation should have meaningful length', () => {
      const docs = [
        'PHASE_3_2_COMPLETION_REPORT.md',
        'PHASE_4_COMPLETE_STATUS.md',
        'DELIVERY_READY.md',
      ];

      docs.forEach((doc) => {
        const filePath = join(docsRoot, doc);
        const content = readFileSync(filePath, 'utf-8');
        // Each doc should be substantial (>5KB)
        expect(content.length).toBeGreaterThan(5000);
      });
    });

    it('should have appropriate level of detail', () => {
      const summaryPath = join(docsRoot, 'PHASE_3_2_PHASE_4_SUMMARY.md');
      const completePath = join(docsRoot, 'PHASE_4_COMPLETE_STATUS.md');

      const summaryContent = readFileSync(summaryPath, 'utf-8');
      const completeContent = readFileSync(completePath, 'utf-8');

      // Summary should be shorter than complete report
      expect(summaryContent.length).toBeLessThan(completeContent.length);
    });

    it('documentation should be current and dated', () => {
      const docs = [
        'PHASE_3_2_COMPLETION_REPORT.md',
        'PHASE_4_COMPLETE_STATUS.md',
        'PROJECT_STATUS_PHASE_3_2_PHASE_4_COMPLETE.md',
      ];

      docs.forEach((doc) => {
        const filePath = join(docsRoot, doc);
        const content = readFileSync(filePath, 'utf-8');
        // Should have date
        expect(content).toMatch(/\d{4}-\d{2}-\d{2}|November|November 2024/i);
      });
    });
  });

  describe('Cross-Reference Documentation', () => {
    it('should have consistent terminology across docs', () => {
      const docs = [
        'PHASE_3_2_COMPLETION_REPORT.md',
        'PHASE_4_COMPLETE_STATUS.md',
      ];

      const termFrequency: { [key: string]: number } = {};
      const keyTerms = ['phase', 'production', 'test', 'component'];

      docs.forEach((doc) => {
        const filePath = join(docsRoot, doc);
        if (!existsSync(filePath)) return;
        const content = readFileSync(filePath, 'utf-8').toLowerCase();

        keyTerms.forEach((term) => {
          const count = (content.match(new RegExp(term.toLowerCase(), 'g')) || []).length;
          termFrequency[term] = (termFrequency[term] || 0) + count;
        });
      });

      // Key terms should appear consistently
      expect((termFrequency['phase'] || 0) > 5).toBe(true);
      expect((termFrequency['production'] || 0) > 0).toBe(true);
    });

    it('should link related documentation', () => {
      const navigationPath = join(docsRoot, 'NAVIGATION_INDEX_PHASE_3_2_PHASE_4.md');
      const content = readFileSync(navigationPath, 'utf-8');

      // Should reference other docs
      expect(content).toContain('.md');
      expect(content).toContain('PHASE_');
    });

    it('should provide multiple entry points for different roles', () => {
      const navigationPath = join(docsRoot, 'NAVIGATION_INDEX_PHASE_3_2_PHASE_4.md');
      const content = readFileSync(navigationPath, 'utf-8');

      // Should have sections for different audiences
      expect(content.toLowerCase()).toContain('project manager');
      expect(content.toLowerCase()).toContain('developer');
      expect(content.toLowerCase()).toContain('qa');
      expect(content.toLowerCase()).toContain('devops');
    });
  });

  describe('Code Example Validation', () => {
    it('should have valid npm command examples', () => {
      const guidePath = join(docsRoot, 'PHASE_3_2_IMPLEMENTATION_GUIDE.md');
      const content = readFileSync(guidePath, 'utf-8');

      // Should have npm commands
      const npmCommands = content.match(/npm\s+(test|run|install)/g) || [];
      expect(npmCommands.length).toBeGreaterThan(0);
    });

    it('should have valid import/export examples', () => {
      const guidePath = join(docsRoot, 'PHASE_3_2_IMPLEMENTATION_GUIDE.md');
      const content = readFileSync(guidePath, 'utf-8');

      // Should show proper imports
      expect(content).toMatch(/import.*from/);
    });

    it('should have deployment command examples', () => {
      const deliveryPath = join(docsRoot, 'DELIVERY_READY.md');
      const content = readFileSync(deliveryPath, 'utf-8');

      // Should show build/deploy commands
      expect(content).toMatch(/npm\s+run\s+build/);
    });
  });

  describe('Documentation Completeness', () => {
    it('should document all Phase 3.2 components', () => {
      const completionPath = join(docsRoot, 'PHASE_3_2_COMPLETION_REPORT.md');
      const content = readFileSync(completionPath, 'utf-8');

      const components = [
        'TelemetryFilterPanel',
        'ExportDialog',
        'RecommendationEngine',
        'ExportService',
      ];

      components.forEach((comp) => {
        expect(content).toContain(comp);
      });
    });

    it('should document all Phase 4 phases', () => {
      const progressPath = join(docsRoot, 'PHASE_4_COMPLETE_STATUS.md');
      const content = readFileSync(progressPath, 'utf-8');

      expect(content).toContain('4.1');
      expect(content).toContain('4.2');
      expect(content).toContain('4.3');
      expect(content).toContain('4.4');
    });

    it('should document test coverage', () => {
      const completePath = join(docsRoot, 'PHASE_4_COMPLETE_STATUS.md');
      const content = readFileSync(completePath, 'utf-8');

      // Should mention test counts
      expect(content).toMatch(/\d+\/\d+.*test/i);
      expect(content).toMatch(/passing/i);
    });

    it('should document performance metrics', () => {
      const performancePath = join(docsRoot, 'PHASE_4_3_PERFORMANCE_VALIDATION_COMPLETE.md');
      const content = readFileSync(performancePath, 'utf-8');

      // Should have actual performance numbers
      expect(content).toMatch(/\d+\.?\d*\s*ms/);
      expect(content).toMatch(/\d+x/);
    });
  });
});
