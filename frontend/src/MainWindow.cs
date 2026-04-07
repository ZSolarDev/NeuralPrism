using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;

public class MainWindow : Window
{
    public MainWindow()
    {
        Title = "NeuralPrism";
        Width = 1280;
        Height = 720;

        TransparencyLevelHint = new[]
        {
            WindowTransparencyLevel.AcrylicBlur,
            WindowTransparencyLevel.Mica,
            WindowTransparencyLevel.Blur
        };

        Background = Brushes.Transparent;
        TransparencyBackgroundFallback = Brushes.Transparent;

        ExtendClientAreaToDecorationsHint = true;
        ExtendClientAreaTitleBarHeightHint = 32;

        var grid = new Grid
        {
            RowDefinitions = new RowDefinitions("32,*")
        };

        var titleBar = new Border
        {
            Background = new SolidColorBrush(Color.Parse("#00000000")),
            Child = new TextBlock
            {
                Text = "NeuralPrism",
                VerticalAlignment = VerticalAlignment.Center,
                Foreground = Brushes.White,
                Margin = new Thickness(12, 0)
            }
        };

        titleBar.PointerPressed += (s, e) =>
        {
            if (e.GetCurrentPoint(this).Properties.IsLeftButtonPressed)
                BeginMoveDrag(e);
        };

        grid.Children.Add(titleBar);
        Grid.SetRow(titleBar, 0);

        grid.Children.Add(new TextBlock
        {
            Text = "hello from pure C#",
            Foreground = Brushes.White,
            Margin = new Thickness(20)
        });
        Grid.SetRow(grid.Children[^1], 1);

        Content = grid;
    }
}