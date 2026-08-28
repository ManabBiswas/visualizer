package codelens;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.Node;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.stmt.*;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * CodeLens Java parser CLI.
 * Reads raw Java source from stdin, parses it with JavaParser, and writes a
 * normalized IR JSON (matching lib/ir.ts) to stdout.
 *
 * Usage: cat Solution.java | java -jar codelens-parser.jar
 */
public class Main {

    private static final Pattern IDENTIFIER = Pattern.compile("\\b([A-Za-z_]\\w*)\\b");
    private static final Set<String> KEYWORDS = new HashSet<>(Arrays.asList(
            "true", "false", "null", "instanceof", "new", "this", "super", "length"));
    private static final int MAX_INPUT_BYTES = 2 * 1024 * 1024;

    public static void main(String[] args) {
        String source;
        try {
            source = readAll(System.in);
        } catch (IOException e) {
            System.err.println("Parse error: failed to read input: " + e.getMessage());
            System.exit(1);
            return;
        }

        // Pathological input (extremely deep nesting, huge files) can overflow the
        // parser's recursion stack or memory — convert any failure into a clean
        // non-zero exit with a message on stderr instead of a JVM stack trace.
        String output;
        try {
            output = buildIr(source);
        } catch (Throwable t) {
            System.err.println("Parse error: " + t.getClass().getSimpleName() + " while analyzing input");
            System.exit(1);
            return;
        }

        PrintStream stdout = new PrintStream(System.out, true, StandardCharsets.UTF_8);
        stdout.print(output);
    }

    private static String buildIr(String source) {
        CompilationUnit cu;
        try {
            cu = StaticJavaParser.parse(source);
        } catch (Exception e) {
            throw new IllegalArgumentException(e.getMessage());
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
            for (int mi = 0; mi < methods.size(); mi++) {
                if (mi > 0) out.append(",");
                emitMethod(out, methods.get(mi));
            }

            out.append("]}");
        }
        out.append("]}");
        return out.toString();
    }

    private static void emitMethod(StringBuilder out, MethodDeclaration m) {
        int startLine = m.getBegin().map(p -> p.line).orElse(0);
        int endLine = m.getEnd().map(p -> p.line).orElse(startLine);

        Set<String> paramNames = new HashSet<>();
        for (Parameter p : m.getParameters()) paramNames.add(p.getNameAsString());

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
        m.findAll(MethodCallExpr.class).forEach(c -> calls.add(callTarget(c)));
        out.append(",\"calls\":[");
        for (int i = 0; i < calls.size(); i++) {
            if (i > 0) out.append(",");
            out.append(json(calls.get(i)));
        }
        out.append("]");

        out.append(",\"comments\":[]"); // comment tags are extracted client-side from raw source (lib/notes/extract.ts)

        out.append(",\"body\":[");
        if (m.getBody().isPresent()) {
            List<String> fragments = new ArrayList<>();
            emitStatements(fragments, m.getBody().get().getStatements(), m.getNameAsString(), paramNames);
            out.append(String.join(",", fragments));
        }
        out.append("]");

        out.append("}");
    }

    private static void emitStatements(List<String> out, List<Statement> statements,
                                       String enclosingMethod, Set<String> paramNames) {
        for (Statement s : statements) {
            out.addAll(emitStatement(s, enclosingMethod, paramNames));
        }
    }

    private static List<String> emitStatement(Statement s, String enclosingMethod,
                                              Set<String> paramNames) {
        List<String> out = new ArrayList<>();
        int line = s.getBegin().map(p -> p.line).orElse(0);

        if (s instanceof ForEachStmt) {
            ForEachStmt each = (ForEachStmt) s;
            int endLine = s.getEnd().map(p -> p.line).orElse(line);
            String condition = each.getVariable().toString() + " : " + each.getIterable().toString();
            StringBuilder sb = new StringBuilder();
            sb.append("{\"type\":\"loop\",\"kind\":\"for\",\"line\":").append(line)
              .append(",\"endLine\":").append(endLine)
              .append(",\"boundType\":\"input-dependent\"")
              .append(",\"condition\":").append(json(collapse(condition)))
              .append(",\"body\":[");
            List<String> body = new ArrayList<>();
            emitStatements(body, extractBody(each.getBody()), enclosingMethod, paramNames);
            sb.append(String.join(",", body));
            sb.append("]}");
            out.add(sb.toString());
            return out;
        }

        if (s instanceof ForStmt || s instanceof WhileStmt || s instanceof DoStmt) {
            String kind = s instanceof ForStmt ? "for" : s instanceof WhileStmt ? "while" : "do-while";
            int endLine = s.getEnd().map(p -> p.line).orElse(line);
            String condition = loopConditionText(s);
            // Calls made in the loop header (condition/update) execute per iteration —
            // emit them as call nodes so the analyzer can see them.
            emitHeaderCalls(out, s, line, enclosingMethod);
            StringBuilder sb = new StringBuilder();
            sb.append("{\"type\":\"loop\",\"kind\":").append(json(kind))
              .append(",\"line\":").append(line)
              .append(",\"endLine\":").append(endLine)
              .append(",\"boundType\":").append(json(classifyLoopBound(s, paramNames)));
            if (condition != null) sb.append(",\"condition\":").append(json(collapse(condition)));
            sb.append(",\"body\":[");
            List<String> body = new ArrayList<>();
            emitStatements(body, extractBody(s), enclosingMethod, paramNames);
            sb.append(String.join(",", body));
            sb.append("]}");
            out.add(sb.toString());
            return out;
        }

        if (s instanceof IfStmt) {
            IfStmt ifStmt = (IfStmt) s;
            emitCallNodes(out, ifStmt.getCondition(), line, enclosingMethod);
            StringBuilder sb = new StringBuilder();
            sb.append("{\"type\":\"if\",\"line\":").append(line).append(",\"branches\":[");
            sb.append("{\"condition\":").append(json(collapse(ifStmt.getCondition().toString()))).append(",\"body\":[");
            List<String> thenBody = new ArrayList<>();
            emitStatements(thenBody, extractBody(ifStmt.getThenStmt()), enclosingMethod, paramNames);
            sb.append(String.join(",", thenBody));
            sb.append("]}");
            if (ifStmt.getElseStmt().isPresent()) {
                sb.append(",{\"isElse\":true,\"body\":[");
                List<String> elseBody = new ArrayList<>();
                emitStatements(elseBody, extractBody(ifStmt.getElseStmt().get()), enclosingMethod, paramNames);
                sb.append(String.join(",", elseBody));
                sb.append("]}");
            }
            sb.append("]}");
            out.add(sb.toString());
            return out;
        }

        if (s instanceof SwitchStmt) {
            SwitchStmt sw = (SwitchStmt) s;
            emitCallNodes(out, sw.getSelector(), line, enclosingMethod);
            StringBuilder sb = new StringBuilder();
            sb.append("{\"type\":\"switch\",\"line\":").append(line).append(",\"cases\":[");
            List<SwitchEntry> entries = sw.getEntries();
            for (int i = 0; i < entries.size(); i++) {
                if (i > 0) sb.append(",");
                SwitchEntry entry = entries.get(i);
                String label = entry.getLabels().isEmpty() ? "default" : entry.getLabels().get(0).toString();
                sb.append("{\"label\":").append(json(collapse(label))).append(",\"body\":[");
                List<String> caseBody = new ArrayList<>();
                emitStatements(caseBody, entry.getStatements(), enclosingMethod, paramNames);
                sb.append(String.join(",", caseBody));
                sb.append("]}");
            }
            sb.append("]}");
            out.add(sb.toString());
            return out;
        }

        if (s instanceof TryStmt) {
            TryStmt t = (TryStmt) s;
            StringBuilder sb = new StringBuilder();
            sb.append("{\"type\":\"try\",\"line\":").append(line).append(",\"body\":[");
            List<String> tryBody = new ArrayList<>();
            emitStatements(tryBody, t.getTryBlock().getStatements(), enclosingMethod, paramNames);
            sb.append(String.join(",", tryBody));
            sb.append("],\"catches\":[");
            List<CatchClause> catches = t.getCatchClauses();
            for (int i = 0; i < catches.size(); i++) {
                if (i > 0) sb.append(",");
                CatchClause c = catches.get(i);
                sb.append("{\"exceptionType\":").append(json(c.getParameter().getTypeAsString()))
                  .append(",\"body\":[");
                List<String> catchBody = new ArrayList<>();
                emitStatements(catchBody, c.getBody().getStatements(), enclosingMethod, paramNames);
                sb.append(String.join(",", catchBody));
                sb.append("]}");
            }
            sb.append("]}");
            out.add(sb.toString());
            return out;
        }

        if (s instanceof ReturnStmt) {
            ReturnStmt r = (ReturnStmt) s;
            if (r.getExpression().isPresent()) {
                // Recursion hiding inside `return f(n - 1) + f(n - 2)` must surface as
                // call nodes, otherwise the complexity analyzer sees O(1).
                emitCallNodes(out, r.getExpression().get(), line, enclosingMethod);
                out.add("{\"type\":\"return\",\"line\":" + line
                        + ",\"value\":" + json(collapse(r.getExpression().get().toString())) + "}");
            } else {
                out.add("{\"type\":\"return\",\"line\":" + line + "}");
            }
            return out;
        }

        if (s instanceof ExpressionStmt) {
            ExpressionStmt es = (ExpressionStmt) s;
            if (es.getExpression().isMethodCallExpr()) {
                out.add(callNodeJson(es.getExpression().asMethodCallExpr(), line, enclosingMethod));
                return out;
            }
        }

        // Any other statement (declarations, assignments, ...): surface method calls
        // nested inside it (e.g. `int x = f(n - 1);`) before the statement itself.
        emitCallNodes(out, s, line, enclosingMethod);
        out.add("{\"type\":\"statement\",\"line\":" + line + ",\"text\":" + json(collapse(s.toString())) + "}");
        return out;
    }

    private static void emitHeaderCalls(List<String> out, Statement loop, int line,
                                        String enclosingMethod) {
        if (loop instanceof ForStmt) {
            ForStmt f = (ForStmt) loop;
            for (Expression init : f.getInitialization()) emitCallNodes(out, init, line, enclosingMethod);
            f.getCompare().ifPresent(c -> emitCallNodes(out, c, line, enclosingMethod));
            for (Expression update : f.getUpdate()) emitCallNodes(out, update, line, enclosingMethod);
        } else if (loop instanceof WhileStmt) {
            emitCallNodes(out, ((WhileStmt) loop).getCondition(), line, enclosingMethod);
        } else if (loop instanceof DoStmt) {
            emitCallNodes(out, ((DoStmt) loop).getCondition(), line, enclosingMethod);
        }
    }

    private static void emitCallNodes(List<String> out, Node scope, int line,
                                      String enclosingMethod) {
        for (MethodCallExpr c : scope.findAll(MethodCallExpr.class)) {
            out.add(callNodeJson(c, line, enclosingMethod));
        }
    }

    private static String callNodeJson(MethodCallExpr c, int line, String enclosingMethod) {
        String target = callTarget(c);
        boolean recursive = c.getNameAsString().equals(enclosingMethod);
        String args = c.getArguments().isEmpty()
                ? ""
                : collapse(c.getArguments().toString().replaceAll("^\\[|\\]$", ""));
        return "{\"type\":\"call\",\"line\":" + line
                + ",\"target\":" + json(target)
                + (args.isEmpty() ? "" : ",\"args\":" + json(args))
                + ",\"isRecursive\":" + recursive + "}";
    }

    /** Qualifies a call with its receiver when it is a simple name: Arrays.sort -> "Arrays.sort". */
    private static String callTarget(MethodCallExpr c) {
        String name = c.getNameAsString();
        if (c.getScope().isPresent()) {
            Expression scope = c.getScope().get();
            if (scope.isNameExpr()) return scope.asNameExpr().getNameAsString() + "." + name;
        }
        return name;
    }

    private static String loopConditionText(Statement s) {
        if (s instanceof ForStmt) return ((ForStmt) s).getCompare().map(Expression::toString).orElse(null);
        if (s instanceof WhileStmt) return ((WhileStmt) s).getCondition().toString();
        if (s instanceof DoStmt) return ((DoStmt) s).getCondition().toString();
        return null;
    }

    private static List<Statement> extractBody(Statement s) {
        if (s instanceof BlockStmt) return ((BlockStmt) s).getStatements();
        if (s instanceof ForStmt) return extractBody(((ForStmt) s).getBody());
        if (s instanceof ForEachStmt) return extractBody(((ForEachStmt) s).getBody());
        if (s instanceof WhileStmt) return extractBody(((WhileStmt) s).getBody());
        if (s instanceof DoStmt) return extractBody(((DoStmt) s).getBody());
        List<Statement> single = new ArrayList<>();
        single.add(s);
        return single;
    }

    /**
     * Classifies a loop's bound as constant (fixed literal), parameter (derived from a
     * method parameter), input-dependent (array length, collection size, or a local whose
     * value comes from the input), or unknown. Feeds the analyzer's confidence score.
     */
    private static String classifyLoopBound(Statement s, Set<String> paramNames) {
        String condition = loopConditionText(s);
        if (condition == null) return "unknown";
        String c = collapse(condition);

        if (c.matches("true")) return "input-dependent"; // loop-until-break terminates on data
        if (c.matches(".*\\w\\.length\\b.*") || c.matches(".*\\w\\.size\\s*\\(\\s*\\).*")) return "input-dependent";

        Set<String> loopVars = new HashSet<>();
        if (s instanceof ForStmt) {
            for (Expression init : ((ForStmt) s).getInitialization()) {
                if (init.isVariableDeclarationExpr()) {
                    for (VariableDeclarator v : init.asVariableDeclarationExpr().getVariables()) {
                        loopVars.add(v.getNameAsString());
                    }
                }
            }
        }

        Set<String> identifiers = new HashSet<>();
        Matcher m = IDENTIFIER.matcher(c);
        while (m.find()) {
            String id = m.group(1);
            if (!KEYWORDS.contains(id)) identifiers.add(id);
        }

        boolean hasDigit = c.matches(".*\\d.*");
        if (!identifiers.isEmpty() && loopVars.containsAll(identifiers) && hasDigit) return "constant";
        for (String id : identifiers) {
            if (paramNames.contains(id)) return "parameter";
        }
        if (!identifiers.isEmpty()) return "input-dependent";
        if (hasDigit) return "constant";
        return "unknown";
    }

    private static String collapse(String text) {
        return text.replaceAll("\\s+", " ").trim();
    }

    private static String readAll(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int read;
        int total = 0;
        while ((read = in.read(chunk)) != -1) {
            total += read;
            if (total > MAX_INPUT_BYTES) {
                throw new IOException("input exceeds the " + MAX_INPUT_BYTES + " byte limit");
            }
            buf.write(chunk, 0, read);
        }
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
