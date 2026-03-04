import type { GradeEntry } from "@shared/types";

interface GradesTableProps {
  grades: GradeEntry[];
}

export function GradesTable({ grades }: GradesTableProps) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-white/5">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-white/5 bg-surface-900/50">
            <th className="px-3 py-2 font-medium text-surface-200">Asignatura</th>
            <th className="px-3 py-2 font-medium text-surface-200">Actividad</th>
            <th className="px-3 py-2 text-right font-medium text-surface-200">Nota</th>
          </tr>
        </thead>
        <tbody>
          {grades.map((grade, i) => (
            <tr
              key={i}
              className="border-b border-white/5 last:border-0 transition-colors hover:bg-surface-800/50"
            >
              <td className="px-3 py-2 text-surface-100">{grade.courseName}</td>
              <td className="px-3 py-2 text-surface-200">{grade.assignmentName}</td>
              <td className="px-3 py-2 text-right">
                {grade.score !== null ? (
                  <span className={getGradeColor(grade.score, grade.maxScore)}>
                    {grade.score}/{grade.maxScore}
                  </span>
                ) : (
                  <span className="text-surface-200/40">Pendiente</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getGradeColor(score: number, max: number): string {
  const pct = (score / max) * 100;
  if (pct >= 80) return "font-medium text-accent-success";
  if (pct >= 50) return "font-medium text-accent-warning";
  return "font-medium text-accent-danger";
}
