import { motion } from "framer-motion";
import type { GradeEntry } from "@shared/types";

interface GradesTableProps {
  grades: GradeEntry[];
}

export function GradesTable({ grades }: GradesTableProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.3 }}
      className="mt-3 overflow-hidden rounded-xl border border-white/[0.06] bg-surface-900/60"
    >
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className="px-3 py-2.5 text-2xs font-medium uppercase tracking-wider text-surface-500">
              Asignatura
            </th>
            <th className="px-3 py-2.5 text-2xs font-medium uppercase tracking-wider text-surface-500">
              Actividad
            </th>
            <th className="px-3 py-2.5 text-right text-2xs font-medium uppercase tracking-wider text-surface-500">
              Nota
            </th>
          </tr>
        </thead>
        <tbody>
          {grades.map((grade, i) => {
            const pct = grade.score !== null ? (grade.score / grade.maxScore) * 100 : null;
            const barColor =
              pct === null ? "bg-surface-700" :
              pct >= 80 ? "bg-accent-success" :
              pct >= 50 ? "bg-accent-warning" :
              "bg-accent-danger";

            return (
              <motion.tr
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 + i * 0.05 }}
                className="border-b border-white/[0.04] last:border-0 transition-colors hover:bg-surface-800/40"
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className={`h-5 w-0.5 rounded-full ${barColor}`} />
                    <span className="text-surface-100">{grade.courseName}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-surface-300">{grade.assignmentName}</td>
                <td className="px-3 py-2.5 text-right">
                  {grade.score !== null ? (
                    <span className="font-mono">
                      <span className={getGradeColor(grade.score, grade.maxScore)}>
                        {grade.score}
                      </span>
                      <span className="text-surface-500">/{grade.maxScore}</span>
                    </span>
                  ) : (
                    <span className="text-surface-500">Pendiente</span>
                  )}
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </motion.div>
  );
}

function getGradeColor(score: number, max: number): string {
  const pct = (score / max) * 100;
  if (pct >= 80) return "font-medium text-accent-success";
  if (pct >= 50) return "font-medium text-accent-warning";
  return "font-medium text-accent-danger";
}
