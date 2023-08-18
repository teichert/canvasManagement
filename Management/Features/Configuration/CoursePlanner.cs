using CanvasModel.EnrollmentTerms;
using CanvasModel.Courses;
using CanvasModel;
using LocalModels;
using CanvasModel.Assignments;
using CanvasModel.Modules;
using Management.Services.Canvas;
using System.Text.RegularExpressions;
using CanvasModel.Quizzes;

namespace Management.Planner;

public class CoursePlanner
{
  private readonly YamlManager yamlManager;
  private readonly CanvasService canvas;
  public bool LoadingCanvasData { get; internal set; } = false;

  public CoursePlanner(YamlManager yamlManager, CanvasService canvas)
  {
    this.yamlManager = yamlManager;
    this.canvas = canvas;
  }

  private Timer? _debounceTimer;
  private int _debounceInterval = 1000;
  private LocalCourse? _localCourse { get; set; }
  public LocalCourse? LocalCourse
  {
    get => _localCourse;
    set
    {
      if (value == null)
      {
        _localCourse = null;
        StateHasChanged?.Invoke();
        return;
      }

      var verifiedCourse = value.GeneralCourseCleanup();

      _debounceTimer?.Dispose();
      _debounceTimer = new Timer(
        (_) => saveCourseToFile(value),
        null,
        _debounceInterval,
        Timeout.Infinite
      );

      _localCourse = verifiedCourse;
      StateHasChanged?.Invoke();
    }
  }

  private void saveCourseToFile(LocalCourse courseAsOfDebounce)
  {
    _debounceTimer?.Dispose();

    // ignore initial load of course
    if (LocalCourse == null)
    {
      Console.WriteLine("saving course as of debounce call time");
      yamlManager.SaveCourse(courseAsOfDebounce);
    }
    else
    {
      Console.WriteLine("Saving latest version of file");
      yamlManager.SaveCourse(LocalCourse);
    }
  }

  public event Action? StateHasChanged;

  public IEnumerable<CanvasAssignment>? CanvasAssignments { get; internal set; }
  public IEnumerable<CanvasQuiz>? CanvasQuizzes { get; internal set; }
  public IEnumerable<CanvasModule>? CanvasModules { get; internal set; }
  public Dictionary<ulong, IEnumerable<CanvasModuleItem>>? CanvasModulesItems { get; internal set; }

  public async Task<(
    IEnumerable<CanvasAssignment> CanvasAssignments,
    IEnumerable<CanvasModule> CanvasModules,
    Dictionary<ulong, IEnumerable<CanvasModuleItem>> CanvasModulesItems,
    IEnumerable<CanvasQuiz> canvasQuizzes
  )> LoadCanvasData()
  {
    LoadingCanvasData = true;
    StateHasChanged?.Invoke();

    var canvasId =
      LocalCourse?.CanvasId ?? throw new Exception("no canvas id found for selected course");

    var assignmentsTask = canvas.Assignments.GetAll(canvasId);
    var quizzesTask = canvas.Quizzes.GetAll(canvasId);
    var modulesTask = canvas.GetModules(canvasId);

    CanvasAssignments = await assignmentsTask;
    CanvasQuizzes = await quizzesTask;
    CanvasModules = await modulesTask;

    CanvasModulesItems = await canvas.GetAllModulesItems(canvasId, CanvasModules);

    LoadingCanvasData = false;
    StateHasChanged?.Invoke();
    return (CanvasAssignments, CanvasModules, CanvasModulesItems, CanvasQuizzes);
  }

  public async Task SyncWithCanvas()
  {
    if (
      LocalCourse == null
      || LocalCourse.CanvasId == null
      || CanvasAssignments == null
      || CanvasModules == null
      || CanvasQuizzes == null
    )
      return;

    Console.WriteLine("syncing with canvas");
    LoadingCanvasData = true;
    StateHasChanged?.Invoke();

    var (canvasAssignments, canvasModules, canvasModuleItems, canvasQuizzes) = await LoadCanvasData();
    LoadingCanvasData = true;
    StateHasChanged?.Invoke();
    LocalCourse = LocalCourse.deleteCanvasIdsThatNoLongerExist(
      canvasModules,
      canvasAssignments,
      canvasQuizzes
    );

    var canvasId =
      LocalCourse.CanvasId ?? throw new Exception("no course canvas id to sync with canvas");

    var newModules = await LocalCourse.EnsureAllModulesExistInCanvas(
      canvasId,
      CanvasModules,
      canvas
    );
    LocalCourse = LocalCourse with { Modules = newModules };
    CanvasModules = await canvas.GetModules(canvasId);

    await LocalCourse.SortCanvasModules(canvasId, CanvasModules, canvas);
    CanvasModulesItems = await canvas.GetAllModulesItems(canvasId, CanvasModules);

    LocalCourse = await LocalCourse.SyncModulesWithCanvasData(canvasId, CanvasModules, canvas);

    LocalCourse = await LocalCourse.SyncAssignmentsWithCanvas(canvasId, CanvasAssignments, canvas);
    CanvasAssignments = await canvas.Assignments.GetAll(canvasId);

    LocalCourse = await LocalCourse.SyncQuizzesWithCanvas(canvasId, CanvasQuizzes, canvas);

    await LocalCourse.SyncModuleItemsWithCanvas(canvasId, CanvasModulesItems, canvas);
    CanvasModulesItems = await canvas.GetAllModulesItems(canvasId, CanvasModules);

    LoadingCanvasData = false;
    StateHasChanged?.Invoke();
    Console.WriteLine("done syncing with canvas\n");
  }

  public void Clear()
  {
    LocalCourse = null;
    CanvasAssignments = null;
    CanvasModules = null;
  }
}
