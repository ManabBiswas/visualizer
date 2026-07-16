package codelens;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.stmt.*;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * CodeLens Java parser CLI.
 * Reads raw Java source from stdin, parses it with JavaParser, and writes a
 * normalized IR JSON (matching lib/ir.ts) to stdout.
 *
 * Usage: cat Solution.java | java -jar codelens-parser.jar
 */
public class Main {

    public static void main(String[] args) throws Exception {
        String source = readAll(System.in);
        CompilationUnit cu;
        try {
            cu = StaticJavaParser.parse(source);
        } catch (Exception e) {
            System.err.println("Parse error: " + e.getMessage());
            System.exit(1);
            return;
        }

        StringBuilder out = new StringBuilder();
        out.append("{\"classes\":[");

        List<ClassOrInterfaceDeclaration> classes = cu.findAll(ClassOrInterfaceDeclaration.class);
        for (int ci = 0; ci < classes.size(); ci++) {
            ClassOrInterfaceDeclaration cls = classes.get(ci);
            if (ci > 0) out.append(",");
            out.append("{\"name\":").append(json(cls.getNameAsString()));
            out.append(",\"methods\":[");

            List<MethodDeclaration> methods = cls.getMethods();
            Set<String> methodNames = new HashSet<>();
            for (MethodDeclaration m : methods) methodNames.add(m.getNameAsString());

            for (int mi = 0; mi < methods.size(); mi++) {
                MethodDeclaration m = methods.get(mi);
                if (mi > 0) out.append(",");
                emitMethod(out, m, methodNames);
            }
            out.append("]}");
        }
        out.append("]}");

        PrintStream stdout = new PrintStream(System.out, true, StandardCharsets.UTF_8);
        stdout.print(out);
    }

    private static void emitMethod(StringBuilder out, MethodDeclaration m, Set<String> methodNames) {
        int startLine = m.getBegin().map(p -> p.line).orElse(0);
        int endLine = m.getEnd().map(p -> p.line).orElse(startLine);

        out.append("{\"name\":").append(json(m.getNameAsString()));
        out.append(",\"signature\":").append(json(m.getDeclarationAsString(false, false, true)));
        out.append(",\"params\":[");
        List<Parameter> params = m.getParameters();
        for (int i = 0; i < params.size(); i++) {
            if (i > 0) out.append(",");
            out.append("{\"name\":").append(json(params.get(i).getNameAsString()))
               .append(",\"type\":").append(json(params.get(i).getTypeAsString())).append("}");
        }
        out.append("]");
        out.append(",\"returnType\":").append(json(m.getTypeAsString()));
        out.append(",\"startLine\":").append(startLine);
        out.append(",\"endLine\":").append(endLine);

        List<String> calls = new ArrayList<>();
        m.findAll(MethodCallExpr.class).forEach(c -> calls.add(c.getNameAsString()));
        out.append(",\"calls\":[");
        for (int i = 0; i < calls.size(); i++) {
            if (i > 0) out.append(",");
            out.append(json(calls.get(i)));
        }
        out.append("]");

        out.append(",\"comments\":[]"); // comment tags are extracted client-side from raw source (lib/notes/extract.ts)

        out.append(",\"body\":[");
        if (m.getBody().isPresent()) {
            emitStatements(out, m.getBody().get().getStatements(), m.getNameAsString(), methodNames);
        }
        out.append("]");

        out.append("}");
    }

    private static void emitStatements(StringBuilder out, List<Statement> statements, String enclosingMethodName, Set<String> methodNames) {
        boolean first = true;
        for (Statement s : statements) {
            String emitted = emitStatement(s, enclosingMethodName, methodNames);
            if (emitted == null) continue;
            if (!first) out.append(",");
            out.append(emitted);
            first = false;
        }
    }

    private static String emitStatement(Statement s, String enclosingMethodName, Set<String> methodNames) {
        int line = s.getBegin().map(p -> p.line).orElse(0);

        if (s instanceof ForStmt || s instanceof WhileStmt || s instanceof DoStmt) {
            String kind = s instanceof ForStmt ? "for" : s instanceof WhileStmt ? "while" : "do-while";
            int endLine = s.getEnd().map(p -> p.line).orElse(line);
            String boundType = classifyLoopBound(s);
            List<Statement> body = extractBody(s);
            StringBuilder sb = new StringBuilder();
            sb.append("{\"type\":\"loop\",\"kind\":").append(json(kind))
              .append(",\"line\":").append(line)
              .append(",\"endLine\":").append(endLine)
              .append(",\"boundType\":").append(json(boundType))
              .append(",\"body\":[");
            emitStatements(sb, body, enclosingMethodName, methodNames);
            sb.append("]}");
            return sb.toString();
        }

        if (s instanceof IfStmt) {
            IfStmt ifStmt = (IfStmt) s;
            StringBuilder sb = new StringBuilder();
            sb.append("{\"type\":\"if\",\"line\":").append(line).append(",\"branches\":[");
            sb.append("{\"condition\":").append(json(ifStmt.getCondition().toString())).append(",\"body\":[");
            emitStatements(sb, extractBody(ifStmt.getThenStmt()), enclosingMethodName, methodNames);
            sb.append("]}");
            if (ifStmt.getElseStmt().isPresent()) {
                sb.append(",{\"isElse\":true,\"body\":[");
                emitStatements(sb, extractBody(ifStmt.getElseStmt().get()), enclosingMethodName, methodNames);
                sb.append("]}");
            }
            sb.append("]}");
            return sb.toString();
        }

        if (s instanceof SwitchStmt) {
            SwitchStmt sw = (SwitchStmt) s;
            StringBuilder sb = new StringBuilder();
            sb.append("{\"type\":\"switch\",\"line\":").append(line).append(",\"cases\":[");
            List<SwitchEntry> entries = sw.getEntries();
            for (int i = 0; i < entries.size(); i++) {
                if (i > 0) sb.append(",");
                SwitchEntry entry = entries.get(i);
                String label = entry.getLabels().isEmpty() ? "default" : entry.getLabels().get(0).toString();
                sb.append("{\"label\":").append(json(label)).append(",\"body\":[");
                emitStatements(sb, entry.getStatements(), enclosingMethodName, methodNames);
                sb.append("]}");
            }
            sb.append("]}");
            return sb.toString();
        }

        if (s instanceof TryStmt) {
            TryStmt t = (TryStmt) s;
            StringBuilder sb = new StringBuilder();
            sb.append("{\"type\":\"try\",\"line\":").append(line).append(",\"body\":[");
            emitStatements(sb, t.getTryBlock().getStatements(), enclosingMethodName, methodNames);
            sb.append("],\"catches\":[");
            List<CatchClause> catches = t.getCatchClauses();
            for (int i = 0; i < catches.size(); i++) {
                if (i > 0) sb.append(",");
                CatchClause c = catches.get(i);
                sb.append("{\"exceptionType\":").append(json(c.getParameter().getTypeAsString()))
                  .append(",\"body\":[");
                emitStatements(sb, c.getBody().getStatements(), enclosingMethodName, methodNames);
                sb.append("]}");
            }
            sb.append("]}");
            return sb.toString();
        }

        if (s instanceof ReturnStmt) {
            return "{\"type\":\"return\",\"line\":" + line + "}";
        }

        if (s instanceof ExpressionStmt) {
            ExpressionStmt es = (ExpressionStmt) s;
            Optional<MethodCallExpr> call = es.getExpression().isMethodCallExpr()
                    ? Optional.of(es.getExpression().asMethodCallExpr())
                    : Optional.empty();
            if (call.isPresent()) {
                String target = call.get().getNameAsString();
                boolean recursive = methodNames.contains(target) && target.equals(enclosingMethodName);
                return "{\"type\":\"call\",\"line\":" + line + ",\"target\":" + json(target)
                        + ",\"isRecursive\":" + recursive + "}";
            }
        }

        return "{\"type\":\"statement\",\"line\":" + line + ",\"text\":" + json(s.toString().replaceAll("\\s+", " ").trim()) + "}";
    }

    private static List<Statement> extractBody(Statement s) {
        if (s instanceof BlockStmt) return ((BlockStmt) s).getStatements();
        List<Statement> single = new ArrayList<>();
        single.add(s);
        return single;
    }

    /**
     * Classifies a loop's bound as constant (fixed literal), parameter (derived from a
     * method parameter), input-dependent (e.g. array length, collection size, or a value
     * read at runtime), or unknown. This feeds directly into the complexity analyzer's
     * confidence score.
     */
    private static String classifyLoopBound(Statement s) {
        String text = s.toString();
        if (text.matches(".*\\b(length|size\\(\\))\\b.*")) return "input-dependent";
        if (text.matches(".*for\\s*\\([^;]*;[^;]*\\d+[^;]*;.*\\).*")) return "constant";
        // Heuristic fallback: presence of a parameter-like lowercase identifier comparison
        return "parameter";
    }

    private static String readAll(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int read;
        while ((read = in.read(chunk)) != -1) buf.write(chunk, 0, read);
        return buf.toString(StandardCharsets.UTF_8);
    }

    private static String json(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        sb.append("\"");
        return sb.toString();
    }
}
